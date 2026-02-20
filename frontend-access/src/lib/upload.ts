// Utilitário para upload de imagens (Mock Local)

async function compressImage(file: File, maxSizeMB = 1): Promise<File> {
  // ... (keep compression logic if needed, but for now just return file)
  return file;
}

export async function uploadImage(
  file: File,
  bucketName: string
): Promise<string> {
  console.log(`Mock uploading ${file.name} to ${bucketName}`);

  // Convert to Base64 to simulate a URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
