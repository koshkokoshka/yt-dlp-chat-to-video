# yt-dlp - Live Chat JSON to MP4 Video

Converts `.live_chat.json` to an `.mp4` video for use as an overlay in video editing.

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

5. After the stream download completes, a `video_id.live_chat.json` file will appear in the directory.<br>
   Use this file as an argument to the script:
    ```bash
    node ./chat-to-video.js video_id.live_chat.json
    ```
    At the end you will see the result in the `output.mp4` file

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
* `--author-color '#aaaaaa'` - Author name color
* `--message-color '#ffffff'` - Message text color
* `--from 0` - Start time in seconds
* `--to 60` - End time in seconds
