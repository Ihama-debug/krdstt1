import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // Safety check: Prevents crashing if the token isn't loaded
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error("Missing BLOB_READ_WRITE_TOKEN!");
        return response.status(500).json({ error: "Missing Blob Token. Redeploy or run 'vercel env pull'." });
    }

    try {
        // Explicitly parse the body if Vercel hasn't done it automatically
        const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;

        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                return {
                    // Allow standard audio file types
                    allowedContentTypes: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a'],
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                console.log('Upload completed:', blob.url);
            },
        });

        return response.status(200).json(jsonResponse);
    } catch (error) {
        // Log the exact error to Vercel so we can read it in the dashboard
        console.error("Upload Route Error:", error);
        return response.status(400).json({ error: error.message });
    }
}