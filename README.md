# UGit

I wanted a decent and free Git GUI and dislike the available options, so I thought I'd see how far I could get making one.

<a href="ugit.png">
<img src="ugit.png" style="width:800px">
</a>

## Building

* Install [Node.js](https://nodejs.org) if you don't already have it installed.

* Install node packages by running `npm install` from the project root folder.

* Build and run for development:
  * Build the app with `npm run build`.
  * Run the app with `npm start`.

* Package into an executable:
  * `npm run build:prod`
  * `npm run build:main`
  * `npm run build:dist`
    * The output will be put into release/ and will include an installer and sub-folder with the executable.

