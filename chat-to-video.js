#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const stream = require('stream');
const { createCanvas, loadImage, registerFont, Image } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');

let YOUTUBE_API_KEY = ''

let CHAT_BACKGROUND = '#0F0F0F'
let AUTHOR_COLOR = 'rgba(255, 255, 255, 0.7)'
let AUTHOR_FONT = '13px Roboto-Medium';
let MESSAGE_COLOR = 'white'
let MESSAGE_FONT = '13px Roboto-Regular';

const AVATAR_SIZE = 24;
const LINE_HEIGHT = 24;

let FALLBACK_AVATAR_IMAGE = new Image();
FALLBACK_AVATAR_IMAGE.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';

const imageCache = new Map(); // URL -> image

async function fetchUserAvatar(message) {
    const channelId = message.authorExternalChannelId;
    if (!channelId) {
        return null;
    }

    // Get saved image
    let image = imageCache.get(channelId);
    if (image) {
        return image;
    }

    // Try load avatar from message data
    const photo = message.authorPhoto;
    if (photo && Array.isArray(photo.thumbnails) && photo.thumbnails.length > 0) {
        try {
            const url = photo.thumbnails[0].url;
            console.log(`Downloading user avatar ${imageCache.size+1} ${url}`);
            image = await loadImage(url);
        } catch (e) {
            console.warn('Failed to load user avatar', e);
        }
    }

    // Try load avatar using YouTube API to fetch channel thumbnail
    if (!image && YOUTUBE_API_KEY && YOUTUBE_API_KEY.length !== 0) {
        try {
            const apiResponse = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&fields=items%2Fsnippet%2Fthumbnails&key=${YOUTUBE_API_KEY}`)).json()
            const url = apiResponse.items[0].snippet.thumbnails.default.url;
            console.log(`Downloading user avatar ${imageCache.size+1} ${url}`);
            image = await loadImage(url);
        } catch (e) {
            console.warn('Failed to load user avatar', e);
        }
    }

    if (!image) {
        return null;
    }

    imageCache.set(channelId, image);
    return image;
}

async function preloadEmoji(emoji) {
    if (imageCache.has(emoji.emojiId)) {
        return true;
    }
    const image = emoji.image;
    if (image && Array.isArray(image.thumbnails) && image.thumbnails.length > 0) {
        try {
            const url = image.thumbnails[0].url;
            console.log(`Downloading emoji ${imageCache.size+1} ${url}`);
            imageCache.set(emoji.emojiId, await loadImage(url));
            return true;
        } catch (e) {
            console.warn('Failed to load emoji', e);
        }
    }
    return false;
}

async function parseMessages(messages, skipAvatars) {
    const result = [];

    for (const message of messages) {

        //
        // Safety checks
        //
        if (!message.replayChatItemAction) {
            continue;
        }
        if (!message.replayChatItemAction.actions || !message.replayChatItemAction.actions.length) {
            continue;
        }

        const chatAction = message.replayChatItemAction.actions[0];
        if (!chatAction) {
            continue;
        }
        if (!chatAction.addChatItemAction) {
            continue;
        }
        if (!chatAction.addChatItemAction.item) {
            continue;
        }

        const liveChatMessage = chatAction.addChatItemAction.item.liveChatTextMessageRenderer;
        if (!liveChatMessage) {
            continue;
        }

        // Get author name
        const authorName = liveChatMessage.authorName;
        if (!authorName) {
            continue; // author name is required (if there is no author name - most likely it's a system message)
        }

        // Load author avatar
        let authorAvatar = null;
        if (!skipAvatars) {
            authorAvatar = await fetchUserAvatar(liveChatMessage);
        }

        let messageTime = message.videoOffsetTimeMsec; // live chat
        if (!message.videoOffsetTimeMsec) {
            messageTime = message.replayChatItemAction.videoOffsetTimeMsec; // replay chat
        }
        if (!messageTime) {
            continue;
        }

        //
        // Format message
        //
        result.push({
            author: authorName.simpleText,
            avatar: authorAvatar,
            text: liveChatMessage.message.runs,
            time: Number(messageTime) / 1000.0 // from milliseconds to seconds
        });
    }

    // Preload emojis
    for (const message of result) {
        for (const span of message.text) {
            if (span.emoji) {
                await preloadEmoji(span.emoji);
            }
        }
    }

    return result;
}

function readMessages(filePath) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath, { encoding: 'utf8' })
        });
        const result = [];
        rl.on('line', (line) => {
            result.push(JSON.parse(line));
        });
        rl.on('close', () => {
            resolve(result);
        });
    });
}

function findMessageIndexAtTime(messages, time) {
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].time > time) {
            return i;
        }
    }
    return messages.length - 1; // last message
}

/**
 * Simple function to parse command line arguments
 */
function parseArgs(args) {
    const result = {
        _: [] // positional arguments goes in this array
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // Handle flags (e.g., --flag or -f)
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
            result[key] = value;
            if (value !== true) { i++; } // skip value
        } else if (arg.startsWith('-')) {
            const key = arg.slice(1);
            const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
            result[key] = value;
            if (value !== true) { i++; } // skip value
        } else {
            // Handle positional arguments
            result._.push(arg);
        }
    }
    return result;
}

function getOutputFileName(inputFilePath) {
    return path.basename(inputFilePath, '.live_chat.json') + '.mp4';
}

function drawRoundedImage(ctx, image, dx, dy, dw, dh) {
    ctx.save();
    ctx.beginPath();
    const radius = Math.min(dw, dh) / 2;
    ctx.arc(dx + radius, dy + radius, radius, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, dx, dy, dw, dh);
    ctx.restore();
}

function drawMessage(ctx, avatarImage, author, message) {
    ctx.font = AUTHOR_FONT;
    let authorMeasurement = ctx.measureText(author);

    let authorX = AVATAR_SIZE + 16; // store left edge of the message content
    let authorY = (LINE_HEIGHT + authorMeasurement.actualBoundingBoxAscent) / 2;

    let messageX = authorX + authorMeasurement.width + 8;
    let messageY = authorY;

    const EMOJI_SIZE = 16;

    function wrapMessage(message) {
        const lines = [ [] ];
        let x = messageX;
        let currentLine = 0;
        for (const span of message) {
            // if (span.text) {
            //     const words = span.text.split(' ');
            //     let text = '';
            //     for (const word of words) {
            //         const wordWidth = ctx.measureText(word + ' ').width;
            //         if ((x+wordWidth) > ctx.canvas.width) {
            //             // new line
            //             lines.push([]);
            //             currentLine++;
            //             x = authorX;
            //         }
            //         // text += word + ' ';
            //         lines[currentLine].push({ x: x, text: word + ' ' });
            //         x += wordWidth;
            //     }
            // }
            if (span.text) {
                const words = span.text.split(' ');
                let text = '';
                let textX = x;
                let textWidth = 0;
                for (const word of words) {
                    const wordWidth = ctx.measureText(word + ' ').width;
                    if ((x+wordWidth) > ctx.canvas.width) {
                        x = authorX;

                        lines[currentLine].push({ x: textX, text: text });
                        textX = x;
                        text = '';

                        // new line
                        lines.push([]);
                        currentLine++;
                    }
                    text += word + ' ';
                    textWidth += wordWidth;

                    x += wordWidth;
                }
                if (text.length > 0) {
                    lines[currentLine].push({ x: textX, text: text });
                }
            }
            if (span.emoji) {
                if ((x+EMOJI_SIZE) > ctx.canvas.width) {
                    // new line
                    lines.push([]);
                    currentLine++;
                    x = authorX;
                }
                lines[currentLine].push({ x: x, emoji: span.emoji });
                x += EMOJI_SIZE;
            }
        }
        return lines;
    }
    const messageLines = wrapMessage(message);

    let avatarX = 0;
    let avatarY = messageLines.length > 1 ? 5 : 0;

    let lineX = messageX;
    let lineY = messageY;
    for (const messageLine of messageLines) {
        lineX  = authorX;
        lineY += 16;
    }

    const messageHeight = Math.max(AVATAR_SIZE, 16 * messageLines.length) + 8; // return total message height + spacing between messages
    ctx.translate(0, -messageHeight);

    // Draw avatar
    drawRoundedImage(ctx, avatarImage ?? FALLBACK_AVATAR_IMAGE, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);

    // Draw author name
    ctx.fillStyle = AUTHOR_COLOR;
    ctx.fillText(author, authorX, authorY);

    // Draw message text
    ctx.font = MESSAGE_FONT;
    ctx.fillStyle = MESSAGE_COLOR;
    lineX = messageX;
    lineY = messageY;
    for (const messageLine of messageLines) {
        for (const span of messageLine) {
            if (span.text) {
                ctx.fillText(span.text, span.x, lineY);
            }
            if (span.emoji) {
                const image = imageCache.get(span.emoji.emojiId);
                if (image) {
                    ctx.drawImage(image, span.x, lineY - EMOJI_SIZE + 2, EMOJI_SIZE, EMOJI_SIZE);
                } else {
                    let emoji = span.emoji?.image?.accessibility?.accessibilityData?.label;
                    ctx.fillRect(emoji, lineY - EMOJI_SIZE, EMOJI_SIZE, EMOJI_SIZE);
                }
            }
        }
        lineX  = authorX;
        lineY += 16;
    }

    return Math.max(AVATAR_SIZE, 16 * messageLines.length) + 8; // return total message height + spacing between messages
}

function drawChat(ctx, messages, currentMessageIndex) {

    // Draw background
    ctx.fillStyle = CHAT_BACKGROUND;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw messages
    ctx.save();
    ctx.translate(0, ctx.canvas.height); // start drawing messages from bottom
    const maxMessagesShown = Math.floor(ctx.canvas.height / LINE_HEIGHT);
    for (let j = 0; j < maxMessagesShown; j++) {
        let message = messages[currentMessageIndex - j];
        if (!message) {
            continue;
        }

        drawMessage(ctx, message.avatar, message.author, message.text);
    }
    ctx.restore();
}

async function main() {
    // Get the command line arguments, excluding the first two elements
    const args = parseArgs(process.argv.slice(2));

    const filePath = args._[0];
    if (!filePath) {
        console.log(`Usage:\n${path.basename(process.argv[1])} <input_file.live_chat.json>`);
        return false;
    }
    if (!fs.existsSync(filePath)) {
        console.error(`Input file not found: ${filePath}`);
        return false;
    }

    // Register fonts
    registerFont(path.join(__dirname, 'Roboto-Regular.ttf'), { family: 'Roboto-Regular' });
    registerFont(path.join(__dirname, 'Roboto-Medium.ttf'), { family: 'Roboto-Medium' });

    YOUTUBE_API_KEY = args['youtube-api-key'] || '';

    const noAvatars = args['no-avatars'] || false;

    // Загрузим сообщения из *.live_chat.json
    let messages;
    messages = await readMessages(filePath);
    messages = await parseMessages(messages, noAvatars);
    if (!messages || !messages.length) {
        console.error(`Failed to read messages from "${filePath}"`);
        return false;
    }

    // Устанавливаем размеры видео и другие параметры
    const width = args['width'] || 385; // размеры взяты от чата ютуба
    const height = args['height'] || 400;
    const frameRate = args['frame-rate'] || 8;

    const maxTime = messages[messages.length - 1].time; // get last message time
    const timeFrom = Number(args['from']) || 0;
    const timeTo = Number(args['to']) || maxTime;

    const outputPath = args['o'] || args['output'] || getOutputFileName(filePath) || 'output.mp4';

    CHAT_BACKGROUND = args['background-color'] || '#0F0F0F';
    AUTHOR_COLOR = args['author-color'] || 'rgba(255, 255, 255, 0.7)';
    MESSAGE_COLOR = args['message-color'] || '#ffffff';

    let currentTime = timeFrom;
    let currentMessageIndex = findMessageIndexAtTime(messages, currentTime);
    let duration = (timeTo - timeFrom) + 2.0; // считаем длительность видео с небольшим запасом
    if (duration <= 0) {
        console.error('Invalid video duration');
        return false;
    }

    // Создаем canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.quality = 'bilinear';
    ctx.textDrawingMode = 'path';
    ctx.antialias = 'subpixel';

    //
    // Generate frames for FFMpeg
    //
    const passThroughStream = new stream.PassThrough();
    const command = ffmpeg(passThroughStream)
      .size(`${width}x${height}`)
      .inputOptions('-r', frameRate)
      .outputOptions('-pix_fmt', 'yuv420p')
      .output(outputPath)
      .on('end', () => {
          console.log('Video created successfully');
      })
      .on('error', (err) => {
          console.error('Error creating video:', err);
      })
      .run();

    const frames = Math.floor(frameRate * duration);
    let framesCounter = 0;
    let framesPerSecond = 0;
    let lastRealTime = Date.now();
    let accumulator1 = 0;
    let accumulator2 = 0;
    let remainingSeconds = 0;
    function getRemainingTimeString(seconds) {
        if (seconds <= 0) {
            return '...'; // unknown
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins > 0) {
            return `${mins}m ${secs}s`;
        }
        return `${secs}s`;
    }
    function printProgress(currentFrame) {
        const statusLine = ''
          + `${currentFrame+1}/${frames} frames, `
          + `${Math.floor(currentTime-timeFrom)}s/${Math.floor(duration)}s, `
          + `${framesPerSecond} FPS, `
          + `x${(framesPerSecond / frameRate).toFixed(1)}, `
          + `${getRemainingTimeString(remainingSeconds)} remaining`;
        process.stdout.write(`Generating video frames... (${statusLine}) \r`);
    }
    function updateProgress(currentFrame) {
        framesCounter++;
        const realTime = Date.now();
        const delta = realTime - lastRealTime;
        accumulator1 += delta;
        accumulator2 += delta;
        if (accumulator1 > 1000) { // every second
            accumulator1 -= 1000;
            framesPerSecond = framesCounter;
            framesCounter = 0;
            const remainingFrames = frames - currentFrame;
            remainingSeconds = remainingFrames / framesPerSecond;
        }
        if (accumulator2 > 200) { // 5 times per second
            accumulator2 -= 200;
            printProgress(currentFrame);
        }
        lastRealTime = realTime;
        if (currentFrame === frames-1) { // done
            printProgress(currentFrame);
            process.stdout.write('\n');
        }
    }

    ctx.fillStyle = CHAT_BACKGROUND;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let i = 0; i < frames; i++) {
        if (currentMessageIndex < messages.length && currentTime >= messages[currentMessageIndex].time) {
            drawChat(ctx, messages, currentMessageIndex);
            currentMessageIndex++;
        }
        passThroughStream.write(canvas.toBuffer('image/png', { compressionLevel: 0 }));
        currentTime = timeFrom + (i / frameRate);

        updateProgress(i);
    }

    console.log('Finishing. Please wait... (may take up to several minutes)');
    passThroughStream.end();
}
main();
