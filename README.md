# Skiply

A dependency-free Chrome Manifest V3 extension for iClicker session monitoring and crowd answer selection.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this folder.
3. Refresh any existing iClicker tabs, sign in, and join your class.
4. Open Skiply. Monitoring is enabled; the four main toggles control monitoring, auto-join, crowd voting, and notifications. All four start enabled.

## Included

- Poll and session detection using the iClicker page, with refresh recovery.
- Scan enrolled courses from the Courses page and auto-join visible live sessions, with bounded retries and an independent toggle.
- A five-second page check plus a thirty-second background alarm fallback.
- Crowd leader display using iClicker's reporting endpoint; automatic crowd selection with a minimum share setting.
- Persistent dark popup dashboard, notifications, searchable local question history (last 500 polls), CSV/JSON exports, and `Alt+Shift+S` monitoring toggle.
- No external dependencies, analytics, or third-party backend. Login tokens are used transiently for requests to iClicker and are never written to extension storage. Remember sign-in retains session cookies in Chrome’s cookie store without making a separate credential backup.

## Current limits

This is an initial implementation, not a verified live iClicker integration. The selectors, session storage fields, and reporting route are based on inspection of [byeClicker](https://github.com/aszaw/byeClicker/blob/main/content.js), not on a captured current session. Code is independently implemented. Reporting access may be denied or results may not be available until a poll closes.

Voting supports the current `#/class/<courseId>/poll` route and legacy `#/polling`. Answer buttons are matched by their visible or accessible A–E labels. Automatic selection matches a live question ID when available, or the visible Question N heading against explicit report question numbers / a chronological report containing exactly N questions. An older or unmatched report does not trigger a click. Session details are read from known activity storage fields or DOM attributes; if those are unavailable, the popup asks you to refresh. Current authentication and reporting access still need live verification. Empty votes and ties never trigger a fallback answer. Crowd share is not an AI confidence or correctness score. Selection records mean a click was dispatched, not server-confirmed acceptance. Missed-poll notices track Skiply clicks, so they may also appear after manual answers.

Leave the iClicker tab open. Chrome can throttle, discard, or freeze background tabs, and alarms do not wake a sleeping computer; this cannot guarantee every short poll will be caught. Closing the popup is fine. A Chrome refresh reloads the content script and restores settings. Extension updates require refreshing existing tabs.

AI features are excluded. Flashcards, advanced analytics, Discord webhooks, and countdowns are not implemented. A countdown needs a reliable server deadline.

## Verify

Run `npm test` and `npm run check`. No installation step is needed.

For a live check, confirm session/poll detection, permissions, question-ID matching, and answer acknowledgement with a permitted test session with monitoring enabled. Confirm that opening a second question does not reuse results from the first. Also test tied votes, unavailable reporting, page refresh, background tabs, turning monitoring off, and two open iClicker tabs.

## Location tools

Open **Location → Manage** in the popup. The editor opens inside the same extension popup; **Back** returns to the main controls. Click the world coordinate grid or enter exact latitude/longitude and accuracy, then **Apply coordinates**. Save named profiles and use or delete them later. Enable **Simulate browser location** to apply the point to `https://student.iclicker.com` and HTTP websites on `localhost` and `127.0.0.1` (all ports). Simulation is independent of poll monitoring and stays enabled until turned off. Other websites are unaffected.

For the included test page:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory tests
```

Open `http://127.0.0.1:8080/location-demo.html`. Read or watch location there, or select that tab in Location tools and click **Check selected test tab**. The check reports browser permission separately from the returned coordinates. Simulation changes `getCurrentPosition` and `watchPosition`, including existing watchers when switching profiles or disabling simulation; it does not alter OS location, network location, or browser permission state. When disabled, new requests use native browser geolocation and may prompt for permission.

Refresh iClicker and local tabs after loading/updating the extension. Initial requests wait up to 1.5 seconds for saved settings before falling back to native geolocation if the bridge is unavailable. Only top-level matching pages are injected; iframes and alternate APIs are outside this tool's scope. The coordinate picker is a labeled latitude/longitude grid, with no external map service. Profiles are stored locally. Location code has automated tests but has not yet been verified in a loaded Chrome extension.

## Remember sign-in

**Remember sign-in** is enabled by default, independently of poll monitoring. Reload the extension and accept Chrome’s new cookie permission, then refresh iClicker and sign in once. Skiply converts existing and newly created browser-session cookies available to `student.iclicker.com` into cookies with a seven-day browser lifetime. Secure, HttpOnly, SameSite, host/domain, path, store, and partition attributes are retained. Existing persistent cookies keep their original expiry. Skiply does not save passwords or cookie values to extension storage, restore deleted cookies, replay signed-out sessions, or automate school SSO/MFA.

This helps when the cause is browser-session cookies disappearing after closing Chrome. It does not make a server-expired session valid, restore `sessionStorage` after a new browser session, or guarantee automatic login. If iClicker relies on tab-only authentication or school SSO, you may still need to sign in. Actual iClicker login retention has not been verified in a live browser.

Turning the setting off stops future cookie changes; cookies already retained keep their existing expiration. Use iClicker’s Sign out action or clear its site cookies to end a retained sign-in immediately. Normal browser cookie clearing, explicit sign-out, expiry, and server revocation are respected.

## Compact controls and starred places

The popup has four main switches: **Skiply on**, **Auto-join sessions**, **Crowd voting**, and **Notifications**. Turning Skiply off stops both joins and votes. Turning Crowd voting off leaves session detection and auto-join running. Remember sign-in, the minimum vote share, and history/exports live under **More**.

Auto-join watches visible, enabled session controls on both legacy `#/courses` pages and current `#/course/<id>/overview` pages, including the reference implementation’s `#btnJoin`. On the current overview, the plain **Join** button is recognized when the **Your instructor started class** banner is present. From `#/courses`, Skiply opens each enrolled course in turn and returns to the list if no live session is found. After a full scan it waits 30 seconds before scanning again. It stops scanning once a join is attempted or a class page opens. It does not enroll in new courses or sign in. You can also leave an individual course overview open. It waits at least ten seconds between clicks and limits a given button to three attempts per minute. The current course list and live-class banner were inspected in Chrome. After reloading v0.5.1 and refreshing Courses, the browser reached the CS 180 class page without manually clicking a course or Join during the check. Course scanning, retry limits, and disabling automation are also covered by automated tests.

Click **Location → Manage** to paste coordinates or a full Google Maps URL containing a pin, numeric query, or map center. A place-name search opens Google Maps; then copy the full location URL or right-click a point to copy coordinates back into Skiply. Short share URLs and links without coordinates cannot be imported directly. Newly saved locations are starred; toggle ★/☆ beside a profile to change this. The popup’s starred dropdown applies a saved point without changing the simulation on/off setting. Location simulation applies to iClicker and local test websites.

## Using a saved location on iClicker

1. Reload Skiply in `chrome://extensions`, then refresh your iClicker tab.
2. Open **Location → Manage**, select or enter your saved point, and turn **Simulate browser location** on.
3. Select the iClicker tab in the geolocation checker to see the coordinates its browser API returns.

The simulator is enabled for the iClicker student web app. It changes the browser Geolocation API only; it does not change IP/network location, the mobile app, or guarantee that iClicker will accept an attendance submission. Live iClicker acceptance is unverified.

## Rejoining after leaving

With Auto-join enabled, returning from `#/class/...` (including an open poll) or legacy `#/polling` to a course overview resets the previous join cooldown and attempt budget. The visible Join/Rejoin button is checked again without refreshing the page. Returning to the Courses list also resets the previous scan so it can find the live course again. Failed clicks on an unchanged course still use the retry limits. Turn Auto-join off when you want to remain outside the class.

Version 0.5.2 has automated regression coverage for repeated leave/rejoin cycles, brief class transitions while a background request is pending, and returning to the Courses list. The new rejoin behavior has not been exercised in the active live poll.

## Periodic session recovery

With monitoring and Auto-join enabled, Skiply checks for available Join/Rejoin controls every five seconds, independently of reporting requests. It also checks when the page changes and on the thirty-second background alarm. Visible session rejoin controls on a current `#/class/...` page are supported without requiring navigation. Existing class/poll pages are left in place when no rejoin control is present. Chrome may delay checks in frozen, discarded, or sleeping tabs. Authentication expiry still requires signing in. The periodic recovery path has automated coverage for stalled reporting and disabled monitoring.

## Voting update (0.6.0)

The voting adapter now supports the current class poll route observed in Chrome, label-based answer controls, question-number correlation, and access-token cookie fallback. Automated coverage includes a modern poll snapshot reaching the correct answer click, plus previous-poll rejection. Refresh iClicker after reloading this update. A vote click is not proof of server acceptance; the live iClicker UI must show the answer as selected to verify it.
