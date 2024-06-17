#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const stream = require('stream');
const { createCanvas } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');

function formatMessageText(messageText) {
    let result = '';
    for (const run of messageText.runs) {
        if (run.text) {
            result += run.text;
        }
        // TODO: Emojis not supported by node-canvas
        // if (run.emoji) {
        //     if (run.emoji.image) {
        //         continue; // TODO: custom emojis not supported yet
        //     }
        //     result += run.emoji.emojiId;
        // }
    }
    return result;
}

function parseMessages(messages) {
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
        if (!chatAction.addChatItemAction.item.liveChatTextMessageRenderer) {
            continue;
        }
        if (!chatAction.addChatItemAction.item.liveChatTextMessageRenderer.authorName) {
            continue;
        }

        //
        // Process message data
        //
        result.push({
            author: chatAction.addChatItemAction.item.liveChatTextMessageRenderer.authorName.simpleText,
            text: formatMessageText(chatAction.addChatItemAction.item.liveChatTextMessageRenderer.message),
            time: Number(message.videoOffsetTimeMsec) / 1000.0 // from milliseconds to seconds
        })
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
            const parsed = parseMessages(result);
            resolve(parsed);
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

function wrapText(ctx, text, firstLineWidth, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < (lines.length === 0 ? firstLineWidth : maxWidth)) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine.length !== 0) {
        lines.push(currentLine);
    }
    return lines;
}

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

// Simple function to parse arguments
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
            if (value !== true) i++;
        } else if (arg.startsWith('-')) {
            const key = arg.slice(1);
            const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
            result[key] = value;
            if (value !== true) i++;
        } else {
            // Handle positional arguments
            result._.push(arg);
        }
    }
    return result;
}

async function main() {
    // Get the command line arguments, excluding the first two elements
    const args = parseArgs(process.argv.slice(2));

    const filePath = args._[0];
    if (!filePath) {
        console.log(`Usage:\n${path.basename(process.argv[1])} <input_file>`);
        return false;
    }
    if (!fs.existsSync(filePath)) {
        console.error(`Input file not found: ${filePath}`);
        return false;
    }

    // Загрузим сообщения из *.live_chat.json
    const messages = await readMessages(filePath);
    if (!messages || !messages.length) {
        console.error(`Failed to read messages from "${filePath}"`);
        return false;
    }

    // Устанавливаем размеры видео и другие параметры
    const width = args['width'] || 385; // размеры взяты от чата ютуба
    const height = args['height'] || 400;
    const frameRate = args['frame-rate'] || 8;

    const maxTime = messages[messages.length - 1].time;
    const timeFrom = args['from'] || 0;
    const timeTo = args['to'] || maxTime;

    const messageLineHeight = 20;
    const maxMessagesShown = Math.floor(height / messageLineHeight);

    const outputPath = args['o'] || args['output'] || 'output.mp4';

    const chatFont = args['font'] || 'bold 16pt Arial';
    const backgroundColor = args['background-color'] || '#000000';
    const authorNameColor = args['author-color'] || '#aaaaaa';
    const messageTextColor = args['message-color'] || '#ffffff';

    let currentTime = 0;
    let currentMessageIndex = findMessageIndexAtTime(messages, currentTime);
    let duration = (timeTo - timeFrom) + 2.0; // считаем длительность видео с небольшим запасом
    if (duration <= 0) {
        console.error('Invalid video duration');
        return false;
    }

    // Создаем canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.font = chatFont;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    function renderChat() {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        let y = height; // start from bottom
        for (let j = 0; j < maxMessagesShown; j++) {
            let message = messages[currentMessageIndex - j];
            if (!message) {
                continue;
            }

            const authorNameText = `${message.author}: `;
            const authorNameWidth = ctx.measureText(authorNameText).width;

            const messageTextLines = wrapText(ctx, message.text, width-authorNameWidth, width);
            y -= messageLineHeight * Math.max(1, messageTextLines.length);
            let lineX = 0;
            let lineY = y;
            ctx.fillStyle = authorNameColor;
            ctx.fillText(authorNameText, lineX, lineY);
            lineX += authorNameWidth;
            for (const line of messageTextLines) {
                ctx.fillStyle = messageTextColor;
                ctx.fillText(line, lineX, lineY);
                lineX = 0;
                lineY += messageLineHeight;
            }
        }
    }

    // Генерация кадров
    const passThroughStream = new stream.PassThrough();
    const command = ffmpeg(passThroughStream)
      .size(`${width}x${height}`)
      .inputOptions([
        '-r', frameRate
      ])
      .outputOptions(
        '-pix_fmt', 'yuv420p'
      )
      .output(outputPath)
      .on('end', () => {
          console.log('Video created successfully');
      })
      .on('error', (err) => {
          console.error('Error creating video:', err);
      })
      .run();

    let framesCounter = 0;
    let framesPerSecond = 0;
    let lastRealTime = Date.now();
    let accumulator1 = 0;
    let accumulator2 = 0;
    let remainingSeconds = 0;
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
    function printProgress(currentFrame) {
        process.stdout.write(`Generating video frames... (${framesPerSecond} FPS, ${currentFrame+1}/${frames} frames, ${Math.floor(currentTime)}s/${Math.floor(duration)}s, ${getRemainingTimeString(remainingSeconds)} remaining) \r`);
    }

    const frames = Math.floor(frameRate * duration);
    for (let i = 0; i < frames; i++) {
        if (currentMessageIndex < messages.length && currentTime >= messages[currentMessageIndex].time) {
            renderChat();
            currentMessageIndex++;
        }
        passThroughStream.write(canvas.toBuffer('image/png', { compressionLevel: 0 }));
        currentTime += 1.0 / frameRate;

        updateProgress(i);
    }

    console.log('Finishing. Please wait... (may take up to several minutes)');
    passThroughStream.end();
}
main();
