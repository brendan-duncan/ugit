export function convertGitSshToHttps(sshUrl: string): string {
    return sshUrl
      .replace(/^git@/, 'https://')  // Swap git@ for https://
      .replace(/\.git$/, '')         // Remove trailing .git
      .replace(/(?<!https):/, '/');  // Replace colon ONLY if not preceded by 'https'
}
