# UGit

I want a decent and free Git GUI and dislike the available options, so I thought I'd see how far I could get making one. 

I started this as an exercise to try out vibe coding. As this was a learning experience, I had record every command I give it to [all-user-commands.txt](all-user-commands.txt).
Was I "vibe coding" correctly? Probably not, but I don't care. Vibe coding is terrible.

## Building

* Install [Node.js](https://nodejs.org) if you don't already have it installed.

* Install node packages by running `npm install` from the project root folder.

* Build and run for development:
  * Build the app with `npm run build`.
  * Run the app with `npm start`.

* Package into an executable:
  * npm run package
    * The output will be put into out/ugit-{os}-{arch}/

* Package into a zip for distrobution:
  * npm run make
    * The output will be put into out/make/zip/{os}/{arch}/ugit-{os}-{arch}-{version}.zip
