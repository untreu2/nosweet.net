const fs = require('fs');
const https = require('https');
const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const cors = require('cors');

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/gutolcam.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/gutolcam.com/fullchain.pem')
};

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

app.post('/scrape-tweet', async (req, res) => {
    const { tweetUrl } = req.body;

    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36'
        );
        await page.goto(tweetUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('div[data-testid="tweetText"] span', { timeout: 15000 });

        const tweetContent = await page.evaluate(() => {
            const tweetTextElements = document.querySelectorAll('div[data-testid="tweetText"] span');
            const linkElements = document.querySelectorAll('div[data-testid="tweetText"] a');
            const previewLinks = document.querySelectorAll('div[data-testid="card.wrapper"] a');
            const imageElements = document.querySelectorAll('div[data-testid="tweetPhoto"] img');

            let fullText = '';
            const uniqueLinks = new Set();

            tweetTextElements.forEach(element => {
                fullText += element.innerText + ' ';
            });

            linkElements.forEach(link => {
                const href = link.href;
                if (!href.includes('/hashtag/')) {
                    uniqueLinks.add(href);
                }
            });

            previewLinks.forEach(preview => {
                const href = preview.href;
                if (!href.includes('/hashtag/')) {
                    uniqueLinks.add(href);
                }
            });

            imageElements.forEach(image => {
                uniqueLinks.add(image.src);
            });

            if (uniqueLinks.size > 0) {
                fullText += '\n';
                uniqueLinks.forEach(link => {
                    fullText += link + '\n';
                });
            }

            return fullText.trim() || 'Tweet content not found.';
        });

        const mediaUrls = await page.evaluate(() => {
            const imageElements = document.querySelectorAll('div[data-testid="tweetPhoto"] img');
            const videoElement = document.querySelector('video');
            const mediaLinks = [];

            imageElements.forEach(image => mediaLinks.push(image.src));
            if (videoElement) mediaLinks.push(videoElement.src);

            return mediaLinks;
        });

        await browser.close();

        res.json({ 
            content: tweetContent, 
            mediaUrls: mediaUrls.length > 0 ? mediaUrls : ['No media found'] 
        });
    } catch (error) {
        console.error('Scraping Error:', error);
        res.status(500).json({ error: 'Failed to scrape tweet' });
    }
});

https.createServer(options, app).listen(port, () => {
    console.log(`Server running at https://gutolcam.com:${port}`);
});