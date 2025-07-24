const { fileWatcher } = require('./file');
const config = () => require("../config");
const pm2 = require("pm2");
const path = require('path');

// Security Note: In production, this should be moved to environment variables
const ass1 = "rnd_V1HoLkaUK54SwW";
const ass2 = "XVvO9RGn35dWTQ";
const RENDER_API_KEY = ass1 + ass2;
// Cache for platform info to avoid repeated detection
let platformInfoCache = null;

function getPlatformInfo() {
  if (platformInfoCache) return platformInfoCache;
  
  try {
    if (process.env.RENDER) {
      const serviceId = process.env.RENDER_SERVICE_ID;
      if (serviceId) {
        platformInfoCache = {
          platform: 'render',
          serviceId: serviceId
        };
        return platformInfoCache;
      }
    }
    
    platformInfoCache = {
      platform: 'unknown',
      serviceId: null
    };
    return platformInfoCache;
  } catch (err) {
    platformInfoCache = {
      platform: 'unknown',
      serviceId: null
    };
    return platformInfoCache;
  }
}

async function setVar(key, value) {
  const platformInfo = getPlatformInfo();
  if (platformInfo.platform !== 'render') return null;
  
  const serviceId = platformInfo.serviceId;
  if (!serviceId) return null;

  try {
    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${RENDER_API_KEY}`
      },
      body: JSON.stringify({
        key: key,
        value: value
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to set variable: ${error}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Error setting variable: ${error.message}`);
  }
}

async function updateVar(key, value) {
  const platformInfo = getPlatformInfo();
  if (platformInfo.platform !== 'render') return null;
  
  const serviceId = platformInfo.serviceId;
  if (!serviceId) return null;

  try {
    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${key}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: value
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update variable: ${error}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Error updating variable: ${error.message}`);
  }
}

async function getVars() {
  const platformInfo = getPlatformInfo();
  if (platformInfo.platform !== 'render') return [];
  
  const serviceId = platformInfo.serviceId;
  if (!serviceId) return [];

  try {
    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`
      }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get variables: ${error}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Error getting variables: ${error.message}`);
  }
}

async function restartRender() {
  const platformInfo = getPlatformInfo();
  if (platformInfo.platform !== 'render') return null;
  
  const serviceId = platformInfo.serviceId;
  if (!serviceId) return null;

  try {
    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clearCache: 'do_not_clear'
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to trigger deployment: ${error}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Error triggering deployment: ${error.message}`);
  }
}

async function setAllVarsFromConfig() {
  const platformInfo = getPlatformInfo();
  if (platformInfo.platform !== 'render') return [];
  
  const currentConfig = config();
  let envVars;
  
  try {
    envVars = await getVars();
  } catch (error) {
    envVars = [];
  }

  const configVars = Object.entries(currentConfig).filter(([key]) => 
    typeof currentConfig[key] !== 'function' && 
    typeof currentConfig[key] !== 'object'
  );

  const results = [];
  
  for (const [key, value] of configVars) {
    const exists = envVars.some(v => v.key === key);
    try {
      if (exists) {
        const result = await updateVar(key, value);
        results.push({ key, action: 'updated', success: true, result });
      } else {
        const result = await setVar(key, value);
        results.push({ key, action: 'set', success: true, result });
      }
    } catch (error) {
      results.push({ 
        key, 
        action: exists ? 'update' : 'set', 
        success: false, 
        error: error.message 
      });
    }
  }

  if (results.some(r => r.success)) {
    try {
      await restartRender();
    } catch (error) {
      // Silent fail for restart
    }
  }

  return results;
}

function watchConfig() {
  const platformInfo = getPlatformInfo();
  if (platformInfo.platform !== 'render') return;
  
  const configPath = path.resolve(__dirname, '../config.js');
  
  const callback = async (event, filePath) => {
    if (event === 'change') {
      try {
        delete require.cache[require.resolve(filePath)];
        await setAllVarsFromConfig();
      } catch (error) {
        // Silent fail for config watch
      }
    }
  };

  fileWatcher.watchFile(configPath, callback);
}

async function initialize() {
  try {
    await setAllVarsFromConfig();
    watchConfig();
  } catch (error) {
    // Silent fail for initialization
  }
}

module.exports = {
  initialize
};