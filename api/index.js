/* Vercel serverless entry — একই requestHandler পুনর্ব্যবহার করে */
'use strict';
const { requestHandler } = require('../server.js');
module.exports = (req, res) => requestHandler(req, res);
