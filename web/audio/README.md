<!--
===============================================================================
web/audio/README.md: how to add optional recorded read-aloud clips
===============================================================================
What this folder is for
  Optional mp3 recordings of the survey's texts (mainly the questions). The
  speaker button plays them instead of the phone's built-in voice.

How it works
  web/config/audio_clips.json says which clip belongs to which text and
  which language. The form downloads a clip only when a partner taps the
  speaker button, so clips never slow down opening the form.

What reads these files
  The form, in the partner's browser.
  scripts/check_config.py, which checks that every clip listed in
  audio_clips.json really exists.

Safety
  Everything in web/ will be public on the internet. Only put recordings of
  our own survey texts here, made with the speaker's permission. NEVER put
  partner voice notes here: they are personal data.
===============================================================================
-->

# Recorded read-aloud clips (optional)

Every question has a speaker button that reads it aloud. By default, it uses the phone's built-in voice. This folder holds optional **recordings** that are played instead.

**You do not need any clips.** The survey works without them. Today this folder holds only this README.

## When clips are worth it

- Many partners' phones have no voice for a language, so the speaker button hides itself.
- The phone's voice mispronounces words or sounds robotic in a language.
- An important question, like the 0–10 question, should sound exactly right.

Start with the questions: the texts whose key starts with `q.`, such as `q.nps`. You do not need every language. A language without a clip simply uses the phone's voice.

## How the files are laid out

The rule is: **`web/audio/<language code>/<string key>.mp3`**

- **Language code:** `hi` Hindi, `ta` Tamil, `te` Telugu, `kn` Kannada, `ml` Malayalam (or `en` English).
- **String key:** the text's code in [`web/i18n/strings.json`](../i18n/strings.json), such as `q.nps`. Keep the dots: the file is `q.nps.mp3`.

For example (these files are made up):

```text
web/audio/
├── README.md          this file
├── hi/
│   ├── q.nps.mp3      the 0–10 question, in Hindi
│   └── q.one_fix.mp3  the "one thing to fix" question, in Hindi
└── ta/
    └── q.nps.mp3      the 0–10 question, in Tamil
```

## Step by step

Run every command from the project folder: open Terminal and run `cd ~/NPSF` first.

1. **Find the text.** Open `web/i18n/strings.json` and search (Cmd+F) for the question. Note its key (for example `q.nps`) and the exact words in the language you will record.
2. **Record it.** Ask a native speaker to read exactly those words, slowly and clearly, in a quiet room. A phone's voice-memo app is fine.
3. **Turn it into a small mp3**, using the settings in [Recommended format](#recommended-format).
4. **Save it in the right place.** Create the language folder if it does not exist yet (here, Hindi):

   ```bash
   mkdir -p web/audio/hi
   ```

   What it does: creates the folder `web/audio/hi`. If it already exists, nothing happens. Then save the file there as `q.nps.mp3`.
5. **List it in [`web/config/audio_clips.json`](../config/audio_clips.json).** Fill in the `clips` part. Keep the `_help` line above it as it is. Paths start inside `web/`, so **do not** write `web/` at the start:

   ```json
   "clips": {
     "q.nps": { "hi": "audio/hi/q.nps.mp3", "ta": "audio/ta/q.nps.mp3" },
     "q.one_fix": { "hi": "audio/hi/q.one_fix.mp3" }
   }
   ```

   Each line connects one text to its clips, one per language. Put a comma between two lines, but not after the last one.
6. **Check it.**

   ```bash
   python3 scripts/check_config.py
   ```

   What it does: checks every settings file, including that every clip listed in `audio_clips.json` really exists.
   **You should see** "All good". A missing clip is reported by name. If that happens, check the spelling, the language folder and the path.
7. **Hear it.** Start the test server (`python3 scripts/mock_server.py`) and open `localhost:8787` in a new Incognito window in Chrome (Cmd+Shift+N). Pick the language, go to that question, and tap the speaker button.

## Recommended format

| Setting | Use | Why |
|---|---|---|
| File type | **mp3** | Plays on every phone. |
| Channels | **Mono** (1 channel) | Speech needs only one channel, so the same bit rate sounds clearer. |
| Bit rate | **32–48 kbps** | Clear speech in a small file. |
| Sample rate | **22.05 kHz or 24 kHz** (22050 or 24000 Hz) | Plenty for a voice. |
| Length | **A few seconds**: just the text | Partners are busy at work. |
| File size | **Under about 60 KB** each | Partners are often on slow mobile data. |

**Making the mp3.** A Mac cannot save mp3 files out of the box. A free editor such as Audacity can (ask IT if you cannot install software). When you export, choose MP3, mono, a constant bit rate of 32–48 kbps, and a sample rate of 22050 or 24000 Hz. Trim the silence at the start and the end.

**Checking a clip.** This shows a clip's details:

```bash
afinfo web/audio/hi/q.nps.mp3
```

What it does: prints the clip's details (`afinfo` comes with every Mac). Look for:

- `Data format:` should say `1 ch` (mono) and `22050 Hz` or `24000 Hz`;
- `estimated duration:` a few seconds;
- `bit rate:` about 32000 to 48000 bits per second.

To see the file sizes in a folder:

```bash
ls -lh web/audio/hi
```

What it does: lists the files in `web/audio/hi` with their sizes. Each should be under about 60K.

## Clips do not slow down the page

The form downloads a clip **only when a partner taps the speaker button**. Clips are not downloaded when the form opens, so adding clips does not make the form slower to open. For the same reason, the page weight that `check_config.py` reports does not count them. Keep each clip small anyway: a partner on slow data has to wait for it after tapping.

## When a text changes

- **If you reword a text** in `strings.json`, record its clips again. Otherwise the old clip keeps saying the old words.
- **To remove a clip,** first delete its entry from `audio_clips.json`, then delete the file. If you do it the other way round, `check_config.py` reports a missing file until you fix the list.

## Safety

- Everything in `web/` will be **public** on the internet once the form is online. Only put recordings of our own survey texts here.
- Use a colleague or a voice artist who is happy for their voice to be public.
- **Never put partner voice notes here.** They are personal data.
- git saves `.mp3` files in this folder on purpose, so the form can play them. It ignores other audio formats such as `.m4a`, `.wav` and `.webm`. Keep your raw recordings outside the project folder.

## If something goes wrong

| What you see | What to do |
|---|---|
| `check_config.py` says a clip is missing | Check the spelling of the file and folder, and that the path in `audio_clips.json` starts with `audio/`, not `web/audio/`. |
| The speaker still uses the phone's voice | Check that the key and the language code in `audio_clips.json` match the text and the language you picked. Then reload with Cmd+Shift+R. |
| The clip does not play | Make sure it really is an mp3, not a renamed `.m4a`. Export it again as mp3. |
| The clip is too big | Export it again at 32 kbps, mono, and trim the silence. |
