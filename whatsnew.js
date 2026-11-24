/* What's new in Thuverse: release notes, newest first.
   To add a release, put a new object at the top of RELEASES:
     id      'YYYY-MM-DD' (or 'YYYY-MM-DD-2' for a second release that day); ids must sort by date
     title   short name for the release
     items   [{kind: 'new' | 'improved' | 'fixed', title, body, preview?}]
   preview is optional and names a small built-in picture: 'tarot', 'views', 'workspaces', 'onboarding'.
   Write for learners: what changed and where to find it. Only list things that are live. */
(function (root) {
  const RELEASES = [
    {id: '2026-11-24-2', title: 'Notifications, a new Settings and a fresh Tarot Corner', items: [
      {kind: 'new', title: 'Notifications', body: 'A bell next to your avatar shows messages for your account. A dot means something is unread; open it and click a message to mark it as read.'},
      {kind: 'improved', title: 'Settings in one window', body: 'Settings now opens over the page you’re on, with Account, Appearance, Preferences, Your data and Keyboard shortcuts in a sidebar. Each section says whether it saves automatically or when you click Save.'},
      {kind: 'improved', title: 'A new look for Tarot Corner', preview: 'tarot', body: 'Cleaner cards and calmer colours, with Past, Present and Future each in their own colour from the draw through to the reading.'},
      {kind: 'improved', title: 'Review in a window', body: 'Reviews open over the page you were on. Press Esc or Exit any time: your progress is saved and you can resume from the dashboard.'},
      {kind: 'improved', title: 'Collections on every entry', preview: 'views', body: 'In My Collections each entry shows which collection it belongs to, or “Default” if it isn’t in one. On the Board, Learning and Mastered columns now have their own soft colours.'},
      {kind: 'fixed', title: 'Scrollbars match your theme', body: 'In Light mode, scrollbars are no longer dark.'},
    ]},
    {id: '2026-11-24', title: 'Tarot Corner, collection views and a friendlier start', items: [
      {kind: 'new', title: 'Tarot Corner', preview: 'tarot',
        body: 'Draw three cards for your past, present and future, turn them over one at a time, then read a short interpretation in English with a Vietnamese explanation. Highlighted words show their meaning, and you can save them to your library. Find it under Learn in the sidebar.'},
      {kind: 'new', title: 'A welcome tour for new accounts', preview: 'onboarding',
        body: 'New accounts get a short tour of saving words, reviewing them and finding your way around, ending with your name and what you’re learning.'},
      {kind: 'new', title: 'What’s new', body: 'This list. The dot on the sparkle icon tells you when there’s something you haven’t seen yet.'},
      {kind: 'improved', title: 'List, Grid and Board views in My Collections', preview: 'views',
        body: 'Switch how your entries are shown. On the Board, drag a card between New, Learning and Mastered to update it. Filter by one or more statuses, and use the tabs to show one entry type at a time.'},
      {kind: 'improved', title: 'Light appearance by default', body: 'Thuverse now starts in Light. Choose Light, Dark or System from your avatar menu and it follows your account to every device.'},
      {kind: 'improved', title: 'Settings', body: 'Preferences is now called Settings, and the sidebar is a little tidier.'},
    ]},
    {id: '2026-11-23', title: 'Language workspaces', items: [
      {kind: 'new', title: 'English and Korean workspaces', preview: 'workspaces',
        body: 'Each language has its own space with its own words, collections and progress. Switch from the language button at the top of the sidebar. The Korean workspace has TOPIK tools and romanization.'},
      {kind: 'new', title: 'Connect Google to your account', body: 'Sign in with your email and password or with Google, on the same account. Manage this under Settings, Login methods.'},
      {kind: 'improved', title: 'Your collections, your way', body: 'Entry types (word, collocation, sentence and so on) are now separate from your own collections, so one collection can mix anything you like.'},
      {kind: 'improved', title: 'A new sign-in screen', body: 'A calmer twilight city behind the sign-in form, with clearer links for creating an account and resetting your password.'},
      {kind: 'improved', title: 'Search while you add', body: 'When you add a word, matching entries you already have appear in a dropdown under the field, so duplicates are easy to spot.'},
      {kind: 'fixed', title: 'Google sign-in', body: 'Coming back from Google now lands you in the app reliably, and any problem is explained in plain words.'},
    ]},
    {id: '2026-11-22', title: 'Lumi, reading sources and search', items: [
      {kind: 'new', title: 'Lumi, your learning buddy', body: 'Tap Lumi in the corner to ask how something in Thuverse works, look up a word and save it, in English or Vietnamese.'},
      {kind: 'new', title: 'Reading sources', body: 'A short list of good places to read, with links. Articles you save can be linked to their source.'},
      {kind: 'new', title: 'Account menu', body: 'Your avatar opens a menu with your profile, Settings, learning goals, appearance and sign out.'},
      {kind: 'improved', title: 'Search everything as you type', body: 'Results appear while you type, grouped by kind, with a full results page when you need more.'},
      {kind: 'improved', title: 'Library and My Collections', body: 'Library holds the shared lessons and resources; My Collections holds what you saved yourself. Linking Phrases has its own type.'},
      {kind: 'improved', title: 'Word, collocation or phrasal verb', body: 'The Add form lets you say what kind of vocabulary you’re saving.'},
      {kind: 'fixed', title: 'No surprise capital letters', body: 'Typing a word on an iPad or phone no longer starts it with a capital letter.'},
    ]},
    {id: '2026-11-20', title: 'Thuverse on the web', items: [
      {kind: 'new', title: 'Your account, on every device', body: 'Sign up with email, or with Google, and your words, notes and progress sync wherever you sign in.'},
      {kind: 'new', title: 'Grammar and sentence structure libraries', body: '34 grammar topics and 15 sentence structures, with examples, ready to read and save.'},
      {kind: 'new', title: 'Your profile', body: 'Pick a display name and an avatar.'},
      {kind: 'improved', title: 'A sidebar that gets out of the way', body: 'Collapse the sidebar to a slim rail on a big screen; on a phone it opens as a drawer.'},
    ]},
  ];
  const api = {releases: RELEASES, latest: RELEASES[0] && RELEASES[0].id};
  root.WHATS_NEW = api;
})(typeof window !== 'undefined' ? window : globalThis);
