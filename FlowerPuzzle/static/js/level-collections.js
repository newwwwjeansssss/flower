import { sortLevelFiles } from '../../levellist.js?v=20261022-mechanics-audit';
export const COLLECTIONS = [
  { id: 'flower', label: '花田', directory: 'level', idBase: 0 },
  { id: 'shape-fill', label: 'Shape Fill', directory: 'shape-fill', idBase: 100000 },
  { id: 'flower-trial', label: '花田试玩 · 1–25 / 31–42关', directory: 'flower-trial', idBase: 200000 }
];
export const collectionOf = level => level?.collection || 'flower';
export const levelsInCollection = (levels, collection) => levels.filter(level => collectionOf(level) === collection);
export async function loadLevelCollections(files = null) {
  const read = async path => {
    if (files) return JSON.parse((await files.readText(path)).content);
    const response = await fetch(path);
    if (!response.ok) throw new Error(`无法读取 ${path} (${response.status})`);
    return response.json();
  };
  const catalog = files ? null : await read('level-catalog.json');
  const groups = await Promise.all(COLLECTIONS.map(async collection => {
    const names = files
      ? sortLevelFiles((await files.list(collection.directory)).entries.filter(e => e.type === 'file').map(e => e.name))
      : sortLevelFiles(catalog[collection.id]);
    return Promise.all(names.map(async fileName => {
      const filePath = `${collection.directory}/${fileName}`;
      return { ...await read(filePath), collection: collection.id, fileName, filePath };
    }));
  }));
  return groups.flat();
}
