// Utilitário para upload de imagens (Base64 Local com compressão)

/**
 * Comprime uma imagem para no máximo maxWidth pixels e qualidade reducida,
 * retornando um File menor para evitar erros 413 (Payload Too Large).
 */
async function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

/**
 * Converte o arquivo para base64 após compressão.
 * O resultado é armazenado localmente como data URL.
 */
export async function uploadImage(
  file: File,
  _bucketName: string
): Promise<string> {
  console.log(`Comprimindo e convertendo ${file.name} para base64...`);
  const compressed = await compressImage(file, 800, 0.7);
  console.log(`Tamanho original: ${(file.size / 1024).toFixed(0)}KB → Comprimido: ${(compressed.size / 1024).toFixed(0)}KB`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(compressed);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}
