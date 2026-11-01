import express from 'express';
import { db } from '../firebase.js';
import NewsletterApi from './API/newsletter.api.js';

const router = express.Router();
const newsletterApi = new NewsletterApi(db);

router.get('/newsletter/confirm', (req, res) => newsletterApi.handleConfirm(req, res));
router.get('/newsletter/unsubscribe', (req, res) => newsletterApi.handleUnsubscribe(req, res));
router.get('/newsletter/remind', (req, res) => newsletterApi.handleSetReminder(req, res));
router.get('/newsletter/remind/cancel', (req, res) => newsletterApi.handleCancelReminder(req, res));

export default router;
