/**
 * HTTP request utilities for server-side web requests.
 *
 * This module provides simple functions for making HTTP requests from the server,
 * useful for fetching data from external APIs.
 *
 * Example usage:
 *   const { fetchJson, fetchText } = require('aide-frame').webRequest;
 *
 *   // Fetch JSON from API
 *   const data = await fetchJson("https://api.example.com/data");
 *   if (data) {
 *       console.log(data.result);
 *   }
 *
 *   // Fetch with custom headers
 *   const data = await fetchJson(
 *       "https://api.example.com/protected",
 *       { headers: { "Authorization": "Bearer token123" } }
 *   );
 */

const { logger } = require('./log');

/**
 * Fetch and parse JSON from a URL.
 *
 * @param {string} url - The URL to fetch from
 * @param {object} options - Options object
 * @param {object} options.headers - Optional HTTP headers
 * @param {number} options.timeout - Request timeout in milliseconds (default: 10000)
 * @returns {Promise<object|null>} Parsed JSON as object/array, or null on error
 */
async function fetchJson(url, options = {}) {
    const { headers = {}, timeout = 10000 } = options;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchHeaders = {
            'User-Agent': 'aide-frame/1.0',
            ...headers,
        };

        logger.debug(`HTTP: GET ${url}`);
        const response = await fetch(url, {
            headers: fetchHeaders,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            logger.error(`HTTP error fetching ${url}: ${response.status} ${response.statusText}`);
            return null;
        }

        const text = await response.text();
        const data = JSON.parse(text);

        // Log response preview (first 100 chars)
        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
        logger.debug(`  -> ${response.status} ${preview}`);

        return data;
    } catch (e) {
        if (e.name === 'AbortError') {
            logger.error(`Timeout fetching ${url}`);
        } else if (e instanceof SyntaxError) {
            logger.error(`JSON decode error from ${url}: ${e.message}`);
        } else {
            logger.error(`Error fetching ${url}: ${e.message}`);
        }
        return null;
    }
}

/**
 * Fetch text content from a URL.
 *
 * @param {string} url - The URL to fetch from
 * @param {object} options - Options object
 * @param {object} options.headers - Optional HTTP headers
 * @param {number} options.timeout - Request timeout in milliseconds (default: 10000)
 * @returns {Promise<string|null>} Response body as string, or null on error
 */
async function fetchText(url, options = {}) {
    const { headers = {}, timeout = 10000 } = options;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchHeaders = {
            'User-Agent': 'aide-frame/1.0',
            ...headers,
        };

        logger.debug(`HTTP: GET ${url}`);
        const response = await fetch(url, {
            headers: fetchHeaders,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            logger.error(`HTTP error fetching ${url}: ${response.status} ${response.statusText}`);
            return null;
        }

        const text = await response.text();

        // Log response preview (first 100 chars)
        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
        logger.debug(`  -> ${response.status} ${preview}`);

        return text;
    } catch (e) {
        if (e.name === 'AbortError') {
            logger.error(`Timeout fetching ${url}`);
        } else {
            logger.error(`Error fetching ${url}: ${e.message}`);
        }
        return null;
    }
}

module.exports = {
    fetchJson,
    fetchText,
};
