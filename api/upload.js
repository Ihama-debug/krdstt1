import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const jsonResponse = await handleUpload({
            body: request.body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                return {
                    // Allow standard audio files
                    allowedContentTypes: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a'],
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                console.log('Upload completed:', blob.url);
            },
        });

        return response.status(200).json(jsonResponse);
    } catch (error) {
        return response.status(400).json({ error: error.message });
    }
}