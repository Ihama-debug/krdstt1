export default async function handler(req, res) {
    // 1. Vercel automatically parses the JSON body, so req.body is ready to use
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { audio, mimeType, duration } = req.body;
        
        // Safety check: Strip the data URI prefix if the frontend sent it by mistake
        const cleanAudio = audio.replace(/^data:audio\/\w+;base64,/, '');
        
        // 2. The Payload (Without the problematic generationConfig)
        const payload = {
            contents: [{
                parts: [
                    {
                        text: `Please transcribe this audio exactly in Central Kurdish (Sorani). You MUST format your entire response as a valid .srt (SubRip Subtitle) file. Do not include any other text, markdown, or greetings. Group the speech into natural, readable subtitle blocks of about ${duration} seconds each. Do NOT create a new block for every single word. Ensure the timestamps match the audio (e.g., 00:00:01,250 --> 00:00:03,100). Break the blocks naturally at the end of sentences or during noticeable pauses. Ensure the SRT file is properly formatted and can be used directly as subtitles for a video,i want 100% correct pls.`
                    },
                    {
                        inlineData: {
                            mimeType: mimeType || "audio/mp3",
                            data: cleanAudio
                        }
                    }
                ]
            }]
            // Removed generationConfig to avoid 400 Bad Request errors
        };

        // 3. CORRECT MODEL NAME: gemini-2.5-flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        let response;
        let data;
        const maxRetries = 2;

        // 4. Exponential Backoff Loop
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

        // 5. Parse and return the text
        let transcribedText = data.candidates[0].content.parts[0].text;
        transcribedText = transcribedText.replace(/^```(srt)?\n?|```$/gm, '').trim();

        return res.status(200).json({ text: transcribedText });

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}