# Todoer

A to-do list with goals, priorities and drag to plan your days. It runs on your own computer, and your tasks live in your own free Supabase project: nothing goes to anyone else's server.

![Todoer's task list](docs/screenshot.png)

- **Goals and priorities.** Every task belongs to a goal and has one of four priorities. A day's list keeps the most important first.
- **Plan by dragging.** Move a task within its day or onto another one. Overdue tasks collect in their own box until you move or finish them.
- **Descriptions with lists**, written the way you would in Notes.
- **Search** that finds every word you type, in any order.
- **Insights**: what you add, by goal, over a week up to five years.
- **Copy a day** as a list for WhatsApp, Notes or email.
- **Nine themes**, and a layout that works on a phone.

Free to use and change for yourself; see [Licence](#licence).

## Before you start

You need:

- **A computer**, Mac or Windows.
- **About 25 minutes**, once.
- **A free Supabase account.** You don't need a card.

## Install it on your computer

### With Publik

Open Todoer on [publik](https://publikhq.com) and follow its steps. They install Git and Node if you need them, then copy Todoer to your computer and start it. Then go to [Connect Supabase](#connect-supabase).

### By hand

1. Install [Node.js](https://nodejs.org), the version marked LTS. On Windows, leave the box "Automatically install the necessary tools" unticked.
2. Install [Git](https://git-scm.com/downloads), if you don't have it.
3. Open **Terminal** (Mac) or **Command Prompt** (Windows), and run:

   ```
   git clone https://github.com/emehta/todoer.git
   cd todoer
   npm install
   npm start
   ```

The first start builds Todoer, which takes a minute or two. Then it opens in your browser at **http://localhost:3101**.

Keep the window that ran `npm start` open: closing it stops Todoer.

## Connect Supabase

Todoer's first screen, **Set up Todoer**, walks you through this. In short:

1. **Make a project.**
   - Sign in at [supabase.com](https://supabase.com/dashboard/projects). A new account may first ask you to name an organisation: any name, on the Free plan.
   - On **Create a new project**, give it a name, a database password (keep it somewhere safe) and the region nearest you.
   - Press **Create new project**, and wait a minute while it starts.
2. **Copy the Project URL.** On your project's home page, its address is just under its name, like `https://abcdefghijklmnopqrst.supabase.co`. Press **Copy** beside it, and paste it into Todoer. Todoer then links straight to the right pages of your project.
3. **Copy the two keys** from **API Keys** (Todoer links to it):
   - the **Publishable key**, which starts `sb_publishable_`;
   - the key under **Secret keys**, which starts `sb_secret_`. It is hidden: press the eye beside it to show it, then copy it.

   Paste both into Todoer and press **Connect**.
4. **Give the project its tables.**
   - In Todoer, press **Copy the setup**.
   - Open the **SQL Editor** (Todoer links to it). If Supabase shows a note about snippets, press **Understood**.
   - Paste, and press **Run**.
   - Back in Todoer, press **Check again**.
5. **Make your account** with an email and a password. This is the only account. You start with two goals, Personal and Work.

The secret key stays on your computer, in a file only your account can read:
- Mac: `~/Library/Application Support/Todoer`
- Windows: `%LOCALAPPDATA%\Todoer`

It is never sent to the page.

**Then turn off sign-ups in Supabase.**
- In your project, open **Authentication**, then **Sign In / Providers**.
- Under **User Signups**, switch off **Allow new users to sign up**, and press **Save changes**.

Nobody who signs up could see your tasks anyway, but this keeps your project to you. Todoer's Settings reminds you until it's off.

Leave **Enable Data API** on (under **Integrations**, **Data API**), as it is when a project is new: Todoer talks to your project through it.

## Open it again

- **Mac:** double-click **Start Todoer.command** in the todoer folder.
- **Windows:** double-click **Start Todoer.cmd** in the todoer folder.

It opens your browser on Todoer, or on the copy already running.

To open it like an app, install it from your browser while it's open: Safari's **File → Add to Dock**, or Chrome's **Install** icon in the address bar.

## Your data

- **It's in your Supabase project.** No one else hosts it.
- **Back up:** Settings → **Download my data** saves every goal and task as one file. Supabase's free plan keeps no backups of its own, so do this now and then.
- **A paused project:** Supabase pauses a free project after a week unused. Todoer then says so and links to it: press **Restore project** there, then **Try again**.
- **Both apps, one project:** CronCal, the calendar (coming soon), can use the same project, and you sign in to both with the same account.

## Update

Stop Todoer (close its window), then run:

```
cd todoer
git checkout main
git pull
npm install
npm start
```

If an update needs a change to your tables, Todoer asks you to run the setup again. That keeps everything you have.

## Something not working

- **"Supabase isn't answering":** check you're online. Your project may be paused: see [Your data](#your-data).
- **"Another program is using port 3101":** start Todoer on another port with `npm start -- --port 3105`.
- **Forgot your password:** on the sign-in screen press **Forgot password?**, and paste your project's secret key to show it's you.
- **Windows says npm isn't recognised:** close the window and open a new **Command Prompt** after installing Node.

## Remove it

1. Delete the todoer folder.
2. Delete the Todoer folder in your computer's app data:
   - Mac: `~/Library/Application Support/Todoer`
   - Windows: `%LOCALAPPDATA%\Todoer`
3. If you're done with Supabase too, delete the project there.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md).

- **You may:** use Todoer, change it and share it, for yourself or for any non-commercial purpose.
- **You may not:** sell it or use it in a business.

Copyright Eshaan Mehta.
