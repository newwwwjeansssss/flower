from __future__ import annotations

import base64
import binascii
import os
import shutil
import tempfile
from pathlib import Path, PureWindowsPath
from typing import Any, Callable


class ApiFault(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _result(method: Callable[..., Any]) -> Callable[..., dict[str, Any]]:
    def wrapped(self: "FileApi", *args: Any, **kwargs: Any) -> dict[str, Any]:
        try:
            data = method(self, *args, **kwargs)
            return {"ok": True, "data": data if data is not None else {}}
        except ApiFault as exc:
            return {"ok": False, "error": {"code": exc.code, "message": str(exc)}}
        except FileNotFoundError:
            return self._error("NOT_FOUND", "文件或目录不存在")
        except FileExistsError:
            return self._error("ALREADY_EXISTS", "目标已存在")
        except PermissionError:
            return self._error("PERMISSION_DENIED", "没有权限执行此操作")
        except UnicodeError:
            return self._error("INVALID_ENCODING", "文件不是有效的 UTF-8 文本")
        except OSError:
            return self._error("IO_ERROR", "本地文件操作失败")

    return wrapped


class FileApi:
    def __init__(self, root: Path, max_read_bytes: int = 33_554_432):
        self._root = Path(root).resolve(strict=True)
        self._max_read_bytes = max_read_bytes

    @staticmethod
    def _error(code: str, message: str) -> dict[str, Any]:
        return {"ok": False, "error": {"code": code, "message": message}}

    def _path(self, relative: str) -> Path:
        if not isinstance(relative, str) or not relative.strip():
            raise ApiFault("INVALID_ARGUMENT", "路径必须是非空字符串")
        win = PureWindowsPath(relative)
        candidate_input = Path(relative)
        if win.is_absolute() or win.drive or candidate_input.is_absolute():
            raise ApiFault("PATH_OUTSIDE_ROOT", "只允许访问应用同级目录内的相对路径")
        candidate = (self._root / candidate_input).resolve(strict=False)
        try:
            if os.path.commonpath((str(self._root), str(candidate))) != str(self._root):
                raise ApiFault("PATH_OUTSIDE_ROOT", "路径超出应用目录")
        except ValueError as exc:
            raise ApiFault("PATH_OUTSIDE_ROOT", "路径超出应用目录") from exc
        return candidate

    def _read(self, path: str) -> bytes:
        target = self._path(path)
        size = target.stat().st_size
        if size > self._max_read_bytes:
            raise ApiFault("FILE_TOO_LARGE", f"文件超过 {self._max_read_bytes} 字节读取上限")
        return target.read_bytes()

    def _atomic_write(self, path: str, content: bytes, overwrite: bool) -> dict[str, Any]:
        target = self._path(path)
        if target.exists() and not overwrite:
            raise FileExistsError
        if not target.parent.is_dir():
            raise FileNotFoundError
        temp_name = ""
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temp:
                temp.write(content)
                temp_name = temp.name
            os.replace(temp_name, target)
        finally:
            if temp_name and os.path.exists(temp_name):
                os.unlink(temp_name)
        return {"path": path.replace("\\", "/"), "size": len(content)}

    @_result
    def list_dir(self, path: str = ".") -> dict[str, Any]:
        target = self._path(path)
        entries = []
        for item in sorted(target.iterdir(), key=lambda p: p.name.casefold()):
            stat = item.stat()
            entries.append({"name": item.name, "type": "directory" if item.is_dir() else "file", "size": stat.st_size})
        return {"path": path, "entries": entries}

    @_result
    def stat(self, path: str) -> dict[str, Any]:
        target = self._path(path)
        info = target.stat()
        return {"path": path, "type": "directory" if target.is_dir() else "file", "size": info.st_size, "modified": info.st_mtime}

    @_result
    def read_text(self, path: str) -> dict[str, Any]:
        return {"path": path, "content": self._read(path).decode("utf-8")}

    @_result
    def read_base64(self, path: str) -> dict[str, Any]:
        return {"path": path, "content": base64.b64encode(self._read(path)).decode("ascii")}

    @_result
    def write_text(self, path: str, content: str, overwrite: bool = True) -> dict[str, Any]:
        if not isinstance(content, str):
            raise ApiFault("INVALID_ARGUMENT", "文本内容必须是字符串")
        return self._atomic_write(path, content.encode("utf-8"), overwrite)

    @_result
    def write_base64(self, path: str, content: str, overwrite: bool = True) -> dict[str, Any]:
        try:
            raw = base64.b64decode(content, validate=True)
        except (binascii.Error, ValueError, TypeError) as exc:
            raise ApiFault("INVALID_BASE64", "内容不是有效的 Base64") from exc
        return self._atomic_write(path, raw, overwrite)

    @_result
    def mkdir(self, path: str, parents: bool = False) -> dict[str, Any]:
        target = self._path(path)
        target.mkdir(parents=parents, exist_ok=False)
        return {"path": path}

    @_result
    def move(self, source: str, destination: str, overwrite: bool = False) -> dict[str, Any]:
        src, dst = self._path(source), self._path(destination)
        if dst.exists() and not overwrite:
            raise FileExistsError
        if not dst.parent.is_dir():
            raise FileNotFoundError
        if overwrite:
            os.replace(src, dst)
        else:
            src.rename(dst)
        return {"source": source, "destination": destination}

    @_result
    def delete(self, path: str, recursive: bool = False) -> dict[str, Any]:
        target = self._path(path)
        if target == self._root:
            raise ApiFault("INVALID_ARGUMENT", "不能删除应用根目录")
        if target.is_dir():
            if any(target.iterdir()) and not recursive:
                raise ApiFault("DIRECTORY_NOT_EMPTY", "目录非空；递归删除需要显式授权")
            shutil.rmtree(target) if recursive else target.rmdir()
        else:
            target.unlink()
        return {"path": path}
