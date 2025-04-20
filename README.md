# yt-dlp - Live Chat JSON to MP4 Video

Converts `.live_chat.json` from [yt-dlp](https://github.com/yt-dlp/yt-dlp) to `.mp4` video for overlaying live chats over recorded streams.

<br/>
<div align="center">
   <img alt="screenshot_1" src="https://github.com/koshkokoshka/yt-dlp-chat-to-video/assets/12164048/1267472b-9905-4b83-93f3-14b3a42e2a10" height="280">
   <img alt="screenshot_2" src="https://github.com/koshkokoshka/yt-dlp-chat-to-video/assets/12164048/e8ca4552-399c-4401-a1da-f9af8182cfde" height="360">
</div>
<br/>

## How to use

1. [Install Node.js](https://nodejs.org/en)

2. [Install FFmpeg](https://ffmpeg.org/download.html)<br>
   (*For Windows users: download [ffmpeg.exe](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip) and place it next to the script file*)

3. Install dependencies
   ```bash
   npm install
   ```

4. Download the YouTube stream with live chat replay using [yt-dlp](https://github.com/yt-dlp/yt-dlp):
    ```bash
    yt-dlp --live-from-start --write-subs https://www.youtube.com/watch?v=CqnNp8kwE78
    ```

5. After the stream download completes, a `<video_id>.live_chat.json` file will appear in the directory.<br>
   Pass this file to the script:
    ```bash
    node ./chat-to-video.js video_id.live_chat.json -o output.mp4
    ```
    When conversion is complete, the result will be in the `output.mp4` file

## Troubleshooting
**Problem:** Fonts look ugly and I see an error like:
`loading Pango-WARNING **: 20:15:46.219: couldn't load font "Roboto Medium Not-Rotated 13px", falling back to "Sans Medium Not-Rotated 13px", expect ugly output.`

**Solution:** If you're on Windows, install the missing font (e.g., Roboto) on your system.


## Command line arguments
```bash
node ./chat-to-video.js [OPTIONS] video_id.live_chat.json -o output.mp4
```
### Options
* `-o output.mp4` `--output output.mp4` - Output filename
* `--width 385` - Video width
* `--height 400` - Video height
* `--frame-rate 10` - Video framerate
* `--font 'bold 16pt Arial'` - Chat font
* `--background-color '#000000'` - Chat background color
* `--author-color 'rgba(255, 255, 255, 0.7)'` - Author name color
* `--message-color '#ffffff'` - Message text color
* `--from 0` - Start time in seconds
* `--to 60` - End time in seconds
* `--no-avatars` - Skip downloading user avatars
* `--youtube-api-key` - (Optional) Specify YouTube API key to download missing user avatars