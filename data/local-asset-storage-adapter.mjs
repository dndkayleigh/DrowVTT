function defaultReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });
}

export function createLocalAssetStorageAdapter(options = {}) {
  const readFileAsDataUrl = typeof options.readFileAsDataUrl === 'function'
    ? options.readFileAsDataUrl
    : defaultReadFileAsDataUrl;

  async function importImageFile(file, kind = 'image') {
    if (!file) throw new Error(`No ${kind} file selected.`);

    const src = await readFileAsDataUrl(file);
    return {
      kind,
      fileName: String(file.name ?? '').trim() || `${kind}-image`,
      mimeType: String(file.type ?? '').trim(),
      src
    };
  }

  return {
    async importMapFile(file) {
      return importImageFile(file, 'map');
    },

    async importTokenArtFile(file) {
      return importImageFile(file, 'token-art');
    }
  };
}
