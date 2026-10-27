export class LocalFiles {
  constructor(api = window.pywebview?.api?.files) {
    if (!api) throw new Error("本地文件 API 尚未就绪");
    this.api = api;
  }
  async call(method, ...args) {
    const result = await this.api[method](...args);
    if (!result.ok) { const error = new Error(result.error.message); error.code = result.error.code; throw error; }
    return result.data;
  }
  list(path = ".") { return this.call("list_dir", path); }
  readText(path) { return this.call("read_text", path); }
  writeText(path, content, overwrite = true) { return this.call("write_text", path, content, overwrite); }
  writeBase64(path, content, overwrite = true) { return this.call("write_base64", path, content, overwrite); }
  mkdir(path, parents = false) { return this.call("mkdir", path, parents); }
  remove(path, recursive = false) { return this.call("delete", path, recursive); }
}

export function waitForLocalFiles() {
  if (window.pywebview?.api?.files) return Promise.resolve(new LocalFiles());
  return new Promise(resolve => window.addEventListener("pywebviewready", () => resolve(new LocalFiles()), { once: true }));
}
