# yt-dlp - Live Chat JSON to MP4 Video

Converts *.live_chat.json to an .mp4 video for use as an overlay in video editing.

## Usage

1. [Install Node.js](https://nodejs.org/en)

2. [Install FFmpeg](https://ffmpeg.org/download.html)<br>
   *For Windows users: Download ffmpeg.exe and place it next to the script file.*

3. Download the YouTube stream with live chat replay using [yt-dlp](https://github.com/yt-dlp/yt-dlp):
    ```bash
    yt-dlp --live-from-start --write-subs <youtube_url>
    ```

4. After the stream download completes, a ".live_chat.json" file will appear in the directory.<br>
   Use this file as an argument to the script:
    ```bash
    node ./ytdlp-chat2video.js input.live_chat.json
    ```

## Command line arguments
```bash
    node ./ytdlp-chat2video.js [OPTIONS] input.live_chat.json -o output.mp4
```
* `-o --output output.mp4` Output filename
* `--width 385` Video width
* `--height 400` Video height
* `--frame-rate 10` Video framerate
* `--font 'bold 16pt Arial'` Chat font
* `--from 0` Start time in seconds
* `--to 60` End time in seconds
