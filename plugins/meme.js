const bot = require("../lib/plugin");
const { downloadContentFromMessage } = require('baileys');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Get the absolute path to the meme directory
const memeDir = path.join(__dirname, 'meme');
const tempDir = path.join(__dirname, 'temp');

// Ensure directories exist on startup
function ensureDirectories() {
  if (!fs.existsSync(memeDir)) {
    fs.mkdirSync(memeDir, { recursive: true });
    console.error(`Meme directory created at: ${memeDir}`);
    throw new Error(`Meme directory didn't exist. Created it at: ${memeDir}. Please add your template images there.`);
  }
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}

// Call this at startup
ensureDirectories();

// Template configurations with absolute paths
const templates = {
  anime: {
    image: path.join(memeDir, 'anime.png'),
    text: {
      x: 70, // Position of the paper area
      y: 50,
      paperWidth: 160, // Width of the paper area
      paperHeight: 110, // Height of the paper area
      maxWidth: 140, // Max text width within paper
      lineHeight: 18, // Line height for text
      fontSize: '12px',
      fontFamily: 'Arial',
      textX: 75, // Text starting X position
      textY: 70, // Text starting Y position
      color: 'black',
      bgColor: 'white'
    }
  },
  trump: {
    image: path.join(memeDir, 'trumSay.png'),
    text: {
      x: 70, y: 150, 
      maxWidth: 700, maxLines: 4,
      fontSize: '35px', color: 'black'
    }
  },
  elon: {
    image: path.join(memeDir, 'elon.jpg'),
    text: {
      x: 60, y: 130,
      maxWidth: 900, maxLines: 5,
      fontSize: '30px', color: 'black'
    }
  },
  mia: {
    image: path.join(memeDir, 'mia.png'),
    text: {
      x: 90, y: 120,
      maxWidth: 600, maxLines: 3,
      fontSize: '35px', color: 'white'
    }
  },
  johni: {
    image: path.join(memeDir, 'johni.png'),
    text: {
      x: 40, y: 210,
      maxWidth: 570, maxLines: 3,
      fontSize: '30px', color: 'white'
    }
  },
  mark: {
    image: path.join(memeDir, 'mark.png'),
    text: {
      x: 30, y: 80,
      maxWidth: 500, maxLines: 3,
      fontSize: '20px', color: 'black'
    }
  },
  ronaldo: {
    image: path.join(memeDir, 'ronaldo.png'),
    text: {
      x: 50, y: 140,
      maxWidth: 600, maxLines: 4,
      fontSize: '35px', color: 'black'
    }
  },
  modi: {
    image: path.join(memeDir, 'modi.png'),
    text: {
      x: 20, y: 70,
      maxWidth: 500, maxLines: 4,
      fontSize: '20px', color: 'black'
    }
  },
  imran: {
    image: path.join(memeDir, 'imran.png'),
    text: {
      x: 20, y: 70,
      maxWidth: 500, maxLines: 5,
      fontSize: '20px', color: 'black'
    }
  }
};

async function createMeme(templateName, text) {
  try {
    if (!templates[templateName]) {
      throw new Error(`Invalid template: ${templateName}`);
    }
    if (!text || typeof text !== 'string') {
      throw new Error('Text content is required');
    }

    const config = templates[templateName];
    
    // Verify template image exists
    if (!fs.existsSync(config.image)) {
      throw new Error(`Template image not found: ${config.image}`);
    }

    const outputPath = path.join(tempDir, `${templateName}_${Date.now()}.png`);

    const image = await loadImage(config.image);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    // Special handling for anime template
    if (templateName === 'anime') {
      // Draw the paper background
      ctx.fillStyle = config.text.bgColor;
      ctx.fillRect(config.text.x, config.text.y, config.text.paperWidth, config.text.paperHeight);
      
      // Set text properties
      ctx.fillStyle = config.text.color;
      ctx.font = `${config.text.fontSize} ${config.text.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      const words = text.split(' ');
      let line = '';
      let y = config.text.textY;
      
      // Word wrapping logic
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > config.text.maxWidth && i > 0) {
          ctx.fillText(line, config.text.textX, y);
          line = words[i] + ' ';
          y += config.text.lineHeight;
          
          // Check if we've exceeded the paper height
          if (y > config.text.y + config.text.paperHeight - config.text.lineHeight) {
            break; // Stop drawing if we run out of space
          }
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, config.text.textX, y); // Draw the last line
    } else {
      // Original handling for other templates
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
    }

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
    }

    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });
    
    return outputPath;
  } catch (error) {
    console.error('Error in createMeme:', error);
    throw error; // Re-throw to handle in the command
  }
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

      const templateLower = template.toLowerCase();
      if (!templates[templateLower]) {
        const templateList = Object.keys(templates).join(', ');
        return await bot.reply(`Invalid template. Available templates: ${templateList}`);
      }

      const memePath = await createMeme(templateLower, text);
      await bot.sendImage(message.chat, memePath, "Here's your meme!");
      
      // Clean up
      fs.unlink(memePath, (err) => {
        if (err) console.error('Error deleting meme file:', err);
      });
    } catch (error) {
      console.error("Meme creation error:", error);
      let errorMsg = `Failed to create meme. ${error.message}`;
      
      // Check if it's a file not found error
      if (error.message.includes('ENOENT') || error.message.includes('not found')) {
        errorMsg += '\nOne of the template images is missing. Please check the meme directory.';
      }
      
      const templateList = Object.keys(templates).join(', ');
      await bot.reply(`${errorMsg}\nUsage: ${message.prefix}meme template|text\nAvailable templates: ${templateList}`);
    }
  }
);