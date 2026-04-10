/**
 * One-time migration script: uploads the existing JSON data from
 * secret/users.json, secret/tasks.json and secret/task-completions.json
 * into the Firestore database.
 *
 * Usage:  node backend/seed-firebase.js
 */

const { db } = require('./firebase');
const fs = require('fs');
const path = require('path');

async function seed() {
    // --- Users ---
    const usersPath = path.join(__dirname, 'secret', 'users.json');
    if (fs.existsSync(usersPath)) {
        const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        for (const user of users) {
            const docId = user.username.toLowerCase();
            await db.collection('users').doc(docId).set(user);
            console.log(`  users/${docId}`);
        }
        console.log(`Seeded ${users.length} users.\n`);
    } else {
        console.log('No users.json found, skipping.\n');
    }

    // --- Tasks ---
    const tasksPath = path.join(__dirname, 'secret', 'tasks.json');
    if (fs.existsSync(tasksPath)) {
        const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        for (const task of tasks) {
            await db.collection('tasks').doc(task.id).set(task);
            console.log(`  tasks/${task.id}`);
        }
        console.log(`Seeded ${tasks.length} tasks.\n`);
    } else {
        console.log('No tasks.json found, skipping.\n');
    }

    // --- Task completions ---
    const completionsPath = path.join(__dirname, 'secret', 'task-completions.json');
    if (fs.existsSync(completionsPath)) {
        const completions = JSON.parse(fs.readFileSync(completionsPath, 'utf8'));
        let count = 0;
        for (const [taskId, entries] of Object.entries(completions)) {
            await db.collection('taskCompletions').doc(taskId).set({ entries });
            console.log(`  taskCompletions/${taskId}`);
            count++;
        }
        console.log(`Seeded ${count} task-completion records.\n`);
    } else {
        console.log('No task-completions.json found, skipping.\n');
    }

    // --- Messages ---
    const mailsPath = path.join(__dirname, 'API', 'mail', 'mails.json');
    if (fs.existsSync(mailsPath)) {
        const mails = JSON.parse(fs.readFileSync(mailsPath, 'utf8'));
        if (Array.isArray(mails)) {
            for (const mail of mails) {
                if (mail.id) {
                    await db.collection('messages').doc(mail.id).set(mail);
                    console.log(`  messages/${mail.id}`);
                }
            }
            console.log(`Seeded ${mails.length} messages.\n`);
        } else {
            console.log('mails.json is not an array, skipping.\n');
        }
    } else {
        console.log('No mails.json found, skipping.\n');
    }

    console.log('Done.');
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
