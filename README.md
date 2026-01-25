# UGit

Experiment writing a git client as an exercize of vibe coding. As this is both a learning experience, I have it record every command I give it to [all-user-commands.txt](all-user-commands.txt). I have been wanting a git client that is better tuned to my personal preferenecs and is reasonably fast for very large repositories, so I used that idea as my learning topic.

I'm doing this in the open in case anyone is interested. I'll save my thoughts on "Vibe Coding" until I get to the end of this exercise and either give up on this project, or give up on AI coding and take over the programming myself. I will say that I really dislike the term "vibe coding".

## AI Coding Models

### Claude Code

Much of the initial app was written with Claude Code. All of the commands in the command log until marked as the start of using OpenCode, is done with Claude.

### OpenCode: Big Pickle

I ran out of Claude budget for the month, so I'm trying [OpenCode](https://opencode.ai) with the free BigPickle model. I marked in the command log where I switched models. If things go bad, I'll give up on this AI experiment and stick with programming old-school.

## Building

* Install [Node.js](https://nodejs.org) if you don't already have it installed.

* Install node packages by running `npm install` from the project root folder.

* Build the app with `npm run build`.

* Run the app with `npm start`.

* You can build it as an executable with `npm run build:exe`
  * Alternatively you can build it as an executable with `npm run build:forge`. This uses Electron Forge instead of Electron Builder, and I don't know which is better at this point.
