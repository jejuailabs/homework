'use client';
/** Resize locally so original camera photos never cross the function body limit. */
export async function preparePhoto(file: File): Promise<Blob> {
    if (file.size > 8 * 1024 * 1024)
        throw new Error('사진은 8MB까지 골라 주세요.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        throw new Error('JPG·PNG·WebP 사진을 골라 주세요.');
    const url = URL.createObjectURL(file), image = new Image();
    try {
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('사진을 읽지 못했어요. 다른 사진을 골라 주세요.')); image.src = url; });
        if (image.naturalWidth * image.naturalHeight > 40000000)
            throw new Error('사진 해상도를 조금 줄여 주세요.');
        const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('사진을 준비하지 못했어요.');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('사진 크기를 줄이지 못했어요.')), 'image/jpeg', .82));
        if (blob.size > 4 * 1024 * 1024)
            throw new Error('사진 크기를 줄여 다시 골라 주세요.');
        return blob;
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
