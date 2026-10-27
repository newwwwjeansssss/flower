// 关卡发现规则。不要在这里维护固定文件数组；WebView 会扫描 level/ 目录。
export const LEVEL_FILE_PATTERN = /^level-.*\.json$/i;

export function sortLevelFiles(names = []) {
  return [...names].filter(name => LEVEL_FILE_PATTERN.test(name)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}
