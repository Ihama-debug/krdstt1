require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// Enable CORS so your frontend can communicate with this backend
app.use(cors());
app.use(express.static(__dirname));

// Increase the JSON payload limit to 50MB (This fixes Netlify's 6MB limit)
app.use(express.json({ limit: '50mb' }));

app.post('/transcribe', async (req, res) => {
    try {
        // 1. Extract the duration from req.body
        const { audio, mimeType, duration } = req.body;
        
        // Safety check: Strip the data URI prefix if the frontend sent it by mistake
        const cleanAudio = audio.replace(/^data:audio\/\w+;base64,/, '');
        
        // 2. Use template literals (backticks ` `) to dynamically insert the duration into the text prompt
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
            }],
            generationConfig: {
            }
        };

        document.getElementById('translateBtn').addEventListener('click', async () => {
    // Replace 'your-final-text-id' with the actual ID of the box holding your transcribed text
    const kurdishTextElement = document.getElementById('your-final-text-id'); 
    
    // Check if it's an input/textarea (use .value) or a div/span (use .innerText)
    const textToTranslate = kurdishTextElement.value || kurdishTextElement.innerText;
    
    const outputDiv = document.getElementById('arabicOutput');

    // Make the output visible and show a loading message
    outputDiv.style.display = 'block';
    outputDiv.innerText = "جاری وەرگێڕانە... (Translating...)";

    if (!textToTranslate.trim()) {
        outputDiv.innerText = "No text to translate.";
        return;
    }

    try {
        // ckb = Central Kurdish (Sorani), ar = Arabic
        const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=ckb|ar`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.responseData && data.responseData.translatedText) {
            outputDiv.innerText = data.responseData.translatedText;
        } else {
            outputDiv.innerText = "Translation failed. Please try again.";
        }
    } catch (error) {
        console.error("Translation Error:", error);
        outputDiv.innerText = "Error connecting to translation service.";
    }
});
        // ... (previous payload setup code remains exactly the same) ...

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

            // If we get a 503 (Service Unavailable) or 429 (Too Many Requests)
            if (response.status === 503 || response.status === 429) {
                if (attempt === maxRetries) {
                    return res.status(503).json({ error: 'Gemini API is currently overloaded after multiple retries. Please try again later.' });
                }
                // Wait 1s, then 2s, then 4s before trying again
                const waitTime = Math.pow(2, attempt - 1) * 1000;
                console.log(`API busy (Attempt ${attempt}). Retrying in ${waitTime/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; 
            }

            // Break out of the loop if the request is successful or has a different error
            break; 
        }

        data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
        }

        // ... (remaining transcription parsing code stays the same) ...

        let transcribedText = data.candidates[0].content.parts[0].text;
        transcribedText = transcribedText.replace(/^```(srt)?\n?|```$/gm, '').trim();

        res.status(200).json({ text: transcribedText });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});