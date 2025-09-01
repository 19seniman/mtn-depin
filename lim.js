require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const nacl = require('tweetnacl');
const base58 = require('base-58');
const { HttpsProxyAgent } = require('https-proxy-agent');

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m",
    blue: "\x1b[33m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m"
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider    🍉   ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;

        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};

const userAgents = ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"];
const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startCountdown(seconds) {
    for (let i = seconds; i > 0; i--) {
        logger.countdown(`Starting next cycle in ${i} seconds...`);
        await delay(1000);
    }
    process.stdout.write("\r" + " ".repeat(50) + "\r");
}

const grokSampleResponse = `Understanding launchpads- Launchpads are platforms that help new cryptocurrencies raise funds and gain exposure. They play a pivotal role in the success of new cryptocurrencies by providing essential resources, exposure, and support that can accelerate growth and adoption.`;
const deepseekSampleResponse = `Of course! This is a great question, as a user-friendly interface is crucial for both beginners and experienced users in DeFi. The "best" platform often depends on your specific needs. For beginners, Coinbase Wallet is great. For a true DeFi experience, Uniswap is the standard.`;

function loadPrivateKeys() {
    const keys = [];
    let i = 1;
    while (process.env[`PRIVATE_KEY_${i}`]) {
        const key = process.env[`PRIVATE_KEY_${i}`].trim();
        if (key) {
            keys.push(key);
        }
        i++;
    }
    return keys;
}

async function main() {
    logger.banner();

    const privateKeys = loadPrivateKeys();
    if (privateKeys.length === 0) {
        logger.critical("No private keys found in your .env file. Make sure they are in the format PRIVATE_KEY_1=... etc.");
        return;
    }
    logger.info(`Loaded ${privateKeys.length} wallet(s) from .env file.`);

    const proxies = fs.readFileSync('proxies.txt', 'utf-8').split('\n').filter(p => p.trim() !== '');
    if (proxies.length > 0) {
        logger.info(`Loaded ${proxies.length} proxies. Running in proxy mode.`);
    } else {
        logger.warn("No proxies found in proxies.txt. Running in direct mode.");
    }

    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        logger.step(`Processing Wallet #${i + 1}/${privateKeys.length}`);

        if (!privateKey) {
            logger.error(`Invalid private key found at position #${i + 1}. Skipping this wallet.`);
            console.log('---------------------------------------------');
            continue;
        }

        try {
            let axiosInstance;
            if (proxies.length > 0) {
                const proxy = proxies[i % proxies.length];
                const proxyAgent = new HttpsProxyAgent(`http://${proxy}`);
                axiosInstance = axios.create({ httpsAgent: proxyAgent });
            } else {
                axiosInstance = axios.create();
            }

            const secretKeyBytes = base58.decode(privateKey);
            const keyPair = nacl.sign.keyPair.fromSecretKey(secretKeyBytes);
            const walletAddress = base58.encode(keyPair.publicKey);

            if (!walletAddress) {
                logger.error("Failed to generate a valid wallet address. Skipping this wallet.");
                console.log('---------------------------------------------');
                continue;
            }

            logger.info(`Wallet Address: ${walletAddress}`);

            const commonHeaders = {
                "Accept": "application/json", "Accept-Language": "en-US,en;q=0.5",
                "Referer": "https://earn.mention.network/", "User-Agent": getRandomUserAgent()
            };

            logger.loading("Step 1/2: Logging in & Verifying Session...");
            const nonceResponse = await axiosInstance.get(`https://api.mention.network/auth/nonce?walletAddress=${walletAddress}&chainId=900`, { headers: commonHeaders });
            const { message, nonce } = nonceResponse.data;
            if (!message || !nonce) throw new Error("Failed to get message or nonce.");

            const messageToSign = new TextEncoder().encode(message);
            const signatureBytes = nacl.sign.detached(messageToSign, keyPair.secretKey);
            const signature = base58.encode(signatureBytes);

            const loginPayload = { walletAddress, chainId: "900", signature, nonce };
            const loginResponse = await axiosInstance.post('https://api.mention.network/auth/login', loginPayload, { headers: { ...commonHeaders, "Content-Type": "application/json" } });
            const { accessToken } = loginResponse.data;
            if (!accessToken) throw new Error("Login failed, accessToken not found.");
            const authToken = `Bearer ${accessToken}`;

            const meResponse = await axiosInstance.get('https://api.mention.network/users/me', { headers: { ...commonHeaders, "Authorization": authToken } });
            const userId = meResponse.data.id;
            if (!userId) throw new Error("Could not get user ID after login.");

            logger.success(`Login successful!`);
            console.log(`   - User ID: ${colors.cyan}${userId}${colors.reset}`);
            console.log(`   - Total Points: ${colors.yellow}${meResponse.data.totalPointPrompt}${colors.reset}`);

            logger.loading("Step 2/2: Starting chat ...");
            const aiModels = ['grok-4', 'deepseek_default'];
            let cycleCount = 1;

            while (true) {
                logger.step(`Starting chat cycle #${cycleCount} for Wallet #${i + 1}`);

                const questionsResponse = await axiosInstance.get('https://api.mention.network/questions/random-list?take=20&page=1', { headers: { ...commonHeaders, "Authorization": authToken } });
                const promptsToAsk = questionsResponse.data.data;
                if (!promptsToAsk || promptsToAsk.length === 0) {
                    logger.warn("Could not fetch new prompts. Waiting before retrying...");
                    await delay(60000);
                    continue;
                }
                logger.info(`Fetched ${promptsToAsk.length} new prompts.`);

                for (let j = 0; j < promptsToAsk.length; j++) {
                    const prompt = promptsToAsk[j];
                    const modelName = aiModels[j % aiModels.length];

                    const modelSearchResponse = await axiosInstance.get(`https://api.mention.network/api/ai-models/search?query=${modelName}`, { headers: commonHeaders });
                    const modelId = modelSearchResponse.data.data[0]?.id;
                    if (!modelId) {
                        logger.warn(`Could not find model ID for ${modelName}. Skipping prompt.`);
                        continue;
                    }

                    let responseText = (modelName === 'grok-4') ? grokSampleResponse : deepseekSampleResponse;
                    logger.loading(`[${j+1}/${promptsToAsk.length}] Answering: "${prompt.text.slice(0, 30)}..."`);
                    const interactionPayload = { userId, modelId, requestText: prompt.text, responseText, metadata: { hasSearch: false, hasDeepSearch: false } };

                    const interactionResponse = await axiosInstance.post('https://api.mention.network/interactions', interactionPayload, { headers: { ...commonHeaders, "Content-Type": "application/json", "Authorization": authToken } });
                    const pointsAwarded = interactionResponse.data?.question?.point;
                    if (pointsAwarded > 0) {
                        logger.info(`Interaction successful. Points awarded: ${pointsAwarded}`);
                    } else {
                        logger.warn(`Interaction submitted, but no points were confirmed.`);
                    }
                    await delay(3000);
                }

                logger.success(`Cycle #${cycleCount} completed.`);
