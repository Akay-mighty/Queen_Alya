const bot = require("../lib/plugin");
const { downloadContentFromMessage } = require('baileys');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Template configurations
const templates = {
  anime: {
    image: './meme/anime.png',
    text: {
      x: 50, y: 140,
      maxWidth: 600, maxLines: 4,
      fontSize: '35px', color: 'black'
    }
  },
  trump: {
    image: './meme/trumSay.png',
    text: {
      x: 70, y: 150, 
      maxWidth: 700, maxLines: 4,
      fontSize: '35px', color: 'black'
    }
  },
  elon: {
    image: './meme/elon.jpg',
    text: {
      x: 60, y: 130,
      maxWidth: 900, maxLines: 5,
      fontSize: '30px', color: 'black'
    }
  },
  mia: {
    image: './meme/mia.png',
    text: {
      x: 90, y: 120,
      maxWidth: 600, maxLines: 3,
      fontSize: '35px', color: 'white'
    }
  },
  johni: {
    image: './meme/johni.png',
    text: {
      x: 40, y: 210,
      maxWidth: 570, maxLines: 3,
      fontSize: '30px', color: 'white'
    }
  },
  mark: {
    image: './meme/mark.png',
    text: {
      x: 30, y: 80,
      maxWidth: 500, maxLines: 3,
      fontSize: '20px', color: 'black'
    }
  },
  ronaldo: {
    image: './meme/ronaldo.png',
    text: {
      x: 50, y: 140,
      maxWidth: 600, maxLines: 4,
      fontSize: '35px', color: 'black'
    }
  },
  modi: {
    image: './meme/modi.png',
    text: {
      x: 20, y: 70,
      maxWidth: 500, maxLines: 4,
      fontSize: '20px', color: 'black'
    }
  },
  imran: {
    image: './meme/imran.png',
    text: {
      x: 20, y: 70,
      maxWidth: 500, maxLines: 5,
      fontSize: '20px', color: 'black'
    }
  }
};

async function createMeme(templateName, text) {
  if (!templates[templateName]) {
    throw new Error(`Invalid template: ${templateName}`);
  }
  if (!text || typeof text !== 'string') {
    throw new Error('Text content is required');
  }

  const config = templates[templateName];
  const outputPath = path.join('./temp', `${templateName}_${Date.now()}.png`);

  const image = await loadImage(config.image);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.font = config.text.fontSize + ' Arial';
  ctx.fillStyle = config.text.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const lines = wrapText(text, ctx, config.text.maxWidth);
  const displayLines = lines.slice(0, config.text.maxLines);
  
  if (lines.length > config.text.maxLines) {
    const lastLine = displayLines[displayLines.length - 1];
    displayLines[displayLines.length - 1] = 
      lastLine.slice(0, Math.max(0, lastLine.length - 10)) + '...';
  }

  displayLines.forEach((line, i) => {
    ctx.fillText(line, config.text.x, config.text.y + (i * 25));
  });

  await fs.promises.mkdir('./temp', { recursive: true });
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  await new Promise((resolve) => out.on('finish', resolve));
  return outputPath;
}

function wrapText(text, context, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const metrics = context.measureText(testLine);

    if (metrics.width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// Meme Generator Command
bot(
  {
    name: "meme",
    info: "Create fake tweets with various celebrity templates\nUsage: meme template|text\nExample: meme elon|Hello world",
    category: "fun",
    filename: __filename
  },
  async (message, bot) => {
    try {
      if (!message.query) {
        const templateList = Object.keys(templates).join(', ');
        return await bot.reply(`Usage: ${message.prefix}meme template|text\nAvailable templates: ${templateList}\nExample: ${message.prefix}meme elon|Hello world`);
      }

      const [template, ...textParts] = message.query.split('|');
      const text = textParts.join('|').trim();

      if (!template || !text) {
        const templateList = Object.keys(templates).join(', ');
        return await bot.reply(`Usage: ${message.prefix}meme template|text\nAvailable templates: ${templateList}\nExample: ${message.prefix}meme elon|Hello world`);
      }

      const memePath = await createMeme(template.toLowerCase(), text);
      await bot.sendImage(message.chat, memePath, "Here's your meme!");
      
      // Clean up
      fs.unlink(memePath, () => {});
    } catch (error) {
      console.error("Meme creation error:", error);
      const templateList = Object.keys(templates).join(', ');
      await bot.reply(`Failed to create meme. ${error.message}\nUsage: ${message.prefix}meme template|text\nAvailable templates: ${templateList}`);
    }
  }
);