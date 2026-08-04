// 1. Explicitly configure Vercel to allow the maximum Hobby plan payload size
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb', 
        },
    },
};

export default async function handler(req, res) {
    // Vercel automatically parses the JSON body, so req.body is ready to use
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { audio, mimeType, duration } = req.body;
        
        // Safety check: Strip the data URI prefix if the frontend sent it by mistake
        const cleanAudio = audio.replace(/^data:audio\/\w+;base64,/, '');
        
        // The Payload
        const payload = {
            contents: [{
                parts: [
                    {
                        text: `Transcribe the provided audio exactly into Central Kurdish (Sorani). Your entire response MUST be formatted exclusively as a valid .srt (SubRip Subtitle) file. Do not include any greetings, markdown formatting outside of the SRT structure, explanations, or extra text. Group the transcribed speech into subtitle blocks by strictly following this hierarchy of priorities: Priority 1 (Single Line Display): Each subtitle block MUST consist of only one single line of text. Do not use line breaks within the text of a single subtitle block. Priority 2 (Time/Duration): Each subtitle block must last approximately ${duration} seconds. Priority 3 (Word Limit): Limit each subtitle block to a maximum of about 4 words to ensure it fits perfectly on one line. Priority 4 (Natural Breaks): Within the constraints of the above priorities, break the subtitle blocks at natural pauses, the end of sentences, or when the speaker stops talking. Do NOT create a new block for every single word. Ensure all timestamps precisely match the audio timing using the standard SRT format (e.g., 00:00:01,250 --> 00:00:03,100). The transcription must be 100% accurate, properly formatted, and ready for immediate video use without any manual editing.`
                    },
                    {
                        inlineData: {
                            mimeType: mimeType || "audio/mp3",
                            data: cleanAudio
                        }
                    }
                ]
            }]
        };

        // 2. SWITCHED MODEL: Now using gemini-3.5-flash for much faster processing speeds to avoid Vercel timeouts
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        let response;
        let data;
        const maxRetries = 2;

        // Exponential Backoff Loop
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 503 || response.status === 429) {
                if (attempt === maxRetries) {
                    return res.status(503).json({ error: 'Gemini API is currently overloaded after multiple retries. Please try again later.' });
                }
                const waitTime = Math.pow(2, attempt - 1) * 1000;
                console.log(`API busy (Attempt ${attempt}). Retrying in ${waitTime/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; 
            }
            break; 
        }

        data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
        }

        // Parse and return the text
        let transcribedText = data.candidates[0].content.parts[0].text;
        transcribedText = transcribedText.replace(/^```(srt)?\n?|```$/gm, '').trim();

        return res.status(200).json({ text: transcribedText });

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}