// Add this configuration to increase the limit
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb', // Increases the payload limit to handle the Base64 audio
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const body = req.body || {};
        // Default target language set to Arabic
        const targetLanguage = body.language || 'Arabic';
        const duration = body.duration || '1 to 2';
        const priorities = body.priorities || { p1: true, p2: true, p3: true, p4: true };
        const keepNames = body.keepNames || '';

        let cleanAudio = '';

        // NEW LOGIC: Download the audio from Vercel Blob URL and convert it to Base64 for Gemini
        if (body.audioUrl) {
            const fileRes = await fetch(body.audioUrl);
            const arrayBuffer = await fileRes.arrayBuffer();
            cleanAudio = Buffer.from(arrayBuffer).toString('base64');
        } else {
            // Fallback for old Base64 uploads
            cleanAudio = (body.audio || '').replace(/^data:audio\/\w+;base64,/, '');
        }

        let prioritiesText = '';
        let currentPriorityNum = 1;

        if (priorities.p1) {
            prioritiesText += ` Priority ${currentPriorityNum} (Single Line Display): Each subtitle block MUST consist of only one single line of text. Do not use line breaks within the text of a single subtitle block.`;
            currentPriorityNum++;
        }
        if (priorities.p2) {
            prioritiesText += ` Priority ${currentPriorityNum} (Time/Duration): Each subtitle block must last approximately ${duration} seconds.`;
            currentPriorityNum++;
        }
        if (priorities.p3) {
            prioritiesText += ` Priority ${currentPriorityNum} (Word Limit): Limit each subtitle block to a maximum of about 4 to 5 words to ensure it fits perfectly on one line.`;
            currentPriorityNum++;
        }
        if (priorities.p4) {
            prioritiesText += ` Priority ${currentPriorityNum} (Natural Breaks): Within the constraints of the above priorities, break the subtitle blocks at natural pauses, the end of sentences, or when the speaker stops talking. Do NOT create a new block for every single word.`;
            currentPriorityNum++;
        }

        if (prioritiesText !== '') {
            prioritiesText = ' Group the transcribed speech into subtitle blocks by strictly following this hierarchy of priorities:' + prioritiesText;
        }

        // Automatically instruct the AI to detect and keep names
        let keepNamesText = '';
        if (keepNames.trim() !== '') {
            keepNamesText = ` 5. Automatically detect any proper nouns (names of people, places, etc.) AND specifically keep the following names/words exactly as they are in Kurdish (do NOT translate them into ${targetLanguage}): ${keepNames}.`;
        } else {
            keepNamesText = ` 5. Automatically detect any proper nouns (such as names of people, cities, or specific places) from the audio and keep them exactly as they are in Kurdish (do NOT translate them into ${targetLanguage}).`;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const payload = {
            contents: [{
                parts: [
                    {
                        text: `You are a strict, literal expert translator and subtitler. The provided audio must be transcribed and translated into ${targetLanguage}. You MUST produce a 100% accurate, literal word-for-word translation. Rules to strictly enforce: 1. Do NOT use synonyms, localization, or paraphrasing. 2. Translate each spoken word directly to its exact, primary equivalent in ${targetLanguage}. 3. Maintain exact literal fidelity without altering original word positions to sound "natural". 4. Ensure zero false translations or added interpretations.${keepNamesText} Your entire response MUST be formatted exclusively as a valid .srt (SubRip Subtitle) file. Do not include any greetings, markdown formatting outside of the SRT structure, explanations, or extra text.${prioritiesText} Ensure all timestamps precisely match the audio timing using the standard SRT format (e.g., 00:00:01,250 --> 00:00:03,100). Output must be 100% accurate, strictly adhering to these constraints.`
                    },
                    {
                        inlineData: {
                            mimeType: body.mimeType || 'audio/mp3',
                            data: cleanAudio,
                        },
                    },
                ],
            }],
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data.error?.message || 'Gemini API Error',
            });
        }

        let transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        transcribedText = transcribedText.replace(/^```(srt)?\n?|```$/gm, '').trim();

        return res.status(200).json({ text: transcribedText });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}