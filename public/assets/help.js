// In-app help (temporary, easy to remove: drop this file's <script> tag and the Help rail button).
//  1. Hover tips on every button, link and field: a written tip where we have one, else the control's own label.
//  2. "?" icons next to each screen title and panel heading; clicking opens a popup explaining the feature.
//  3. "Show me" demo tours that walk through a screen step by step.
const TIP_DELAY = 350;
const STORE_KEY = "autopulse.helpIcons";

// ---------- 1. written tips for controls (by id, then by form field name) ----------
const TIPS = {
  "rail-toggle": "Show or hide the section names next to the icons.",
  "theme-btn": "Switch between dark and light colours.",
  "logout-btn": "Sign out of AutoPulse on this device.",
  "help-btn": "Explain the screen you are on, with a short demo.",
  "dealership-switch": "Which dealership you are looking at. Chats, leads, stock and settings follow this choice.",
  "enable-calls-btn": "Allow this browser to make and receive phone calls with customers.",
  search: "Find a chat by customer name or phone number.",
  "new-chat-btn": "Start a new conversation with a customer who agreed to get messages from the store (WhatsApp or SMS).",
  "t-consent": "Consent: click to record that the customer agreed to get messages, or that they asked to stop.",
  "broadcast-btn": "Send one message to up to 25 people as private chats. WhatsApp: open 24-hour window only. SMS: recorded consent only, not 8 PM–8 AM.",
  "room-btn": "Create a Twilio WhatsApp room or an eligible Meta invite-only group.",
  "back-btn": "Back to the list of chats.",
  "rename-btn": "Change the name shown for this customer.",
  "thread-search-btn": "Search the messages in this chat.",
  "starred-filter": "Show only the messages you starred.",
  "save-lead-btn": "Save this customer as a lead (interested in a car). It is e-mailed to the dealer's CRM.",
  "book-visit-btn": "Book a showroom visit for this customer. It appears under Appointments.",
  "call-btn": "Call this customer from the browser.",
  "invite-btn": "Add a person to a list or room, or refresh the invite link for an existing Meta WhatsApp group.",
  "flag-btn": "Mark this chat as needing a person (stops the AI).",
  "unflag-btn": "Clear the needs-a-person mark.",
  "bot-toggle": "AI replies on or off for this chat. Off = only your team replies.",
  "request-access": "Ask the person handling this chat to let you reply.",
  "template-btn": "Send an approved template. Needed when the customer last wrote more than 24 hours ago.",
  "template-tool": "Send an approved WhatsApp template message.",
  "inventory-btn": "Pick cars from the dealer's stock and send them as cards.",
  "composer-input": "Type your reply. Enter sends, Shift+Enter adds a new line.",
  "emoji-btn": "Add an emoji.",
  "attach-btn": "Attach a photo, video or document.",
  "voice-btn": "Record a voice note.",
  "send-btn": "Send the message.",
  "dash-store": "Show the numbers for one store or all your stores together.",
  "leads-csv": "Download the leads in the list as a spreadsheet (CSV).",
  "appts-csv": "Download the appointments as a spreadsheet (CSV).",
  "appts-tracking-csv": "Download how Messenger bookings were tracked (link opened, then booked).",
  "convs-csv": "Download one row per chat: counts, clicks, session time and booking.",
  "convs-transcripts": "Download every message of the chats in the list.",
  "store-geocode": "Look up the map position from the address above.",
  "store-map-link": "Open the store's position on a map.",
  "store-embed-copy": "Copy the chat code to paste on the dealer's website.",
  "store-detail-save": "Save the store details.",
  "store-check": "See how many cars the stock feed has for this website before adding the store.",
  "store-add": "Add this store to your account.",
  "ai-inbound-toggle": "Master switch: AI replies to new messages on every platform below.",
  "profile-photo-input": "Upload your photo (PNG, JPEG or WebP).",
  "profile-photo-remove": "Remove your photo.",
  "number-dealership": "Which dealership this WhatsApp number answers for.",
  "number-dealership-save": "Connect this WhatsApp number to the chosen dealership.",
  "stores-csv": "Download the stores in the list as a spreadsheet (same columns as the chatbot app).",
  "stores-add-btn": "Create a dealer account with its store. The dealer signs in with its e-mail.",
  "stores-import-file": "Add many stores at once from a CSV: Name, Email, Phone Number, Dealership Name, Website, ADF Email.",
  "impersonation-return": "Leave this dealer's view and go back to your own admin account.",
  "out-service": "Show calls to one service only.",
  "out-failed": "Show only calls that failed.",
  "site-logo-light-input": "Upload the logo used on light backgrounds.",
  "site-logo-dark-input": "Upload the logo used on dark backgrounds (sign-in and sign-up pages).",
};
const FIELD_TIPS = {
  q: "Search by VIN, make, model or colour.",
  search: "Search by name, e-mail, phone, VIN or message text.",
  from: "Only show records from this date.",
  to: "Only show records up to this date (the whole day counts).",
  store: "This store, all your stores, or one store.",
  status: "Only leads not opened yet, or whose car is no longer listed.",
  source: "Where the booking came from.",
  channel: "Only chats from this platform.",
  orderBy: "Sort chats by follow-ups or by a type of click, like the chatbot app.",
  kind: "CRM dealers, self sign-up stores, local stores or the test dealership.",
  subscription: "Subscription as the chatbot app has it (until billing moves here).",
  siteName: "AutoPulse's name on the public pages.",
  supportEmail: "Shown on the public pages for questions.",
  supportPhone: "Shown on the public pages for questions.",
  all: "This dealership, or every dealership (AutoPulse admins).",
  sort: "How to order the cars.",
  make: "Only this make. The number is how many are on the lot.",
  model: "Only this model (pick a make first).",
  bodyType: "Only this body style.",
  condition: "New, used or both.",
  yearMin: "Oldest model year.", yearMax: "Newest model year.",
  priceMin: "Lowest price.", priceMax: "Highest price.", milesMax: "Most miles.",
  emails: "Where new leads and appointments are e-mailed as ADF/XML for the dealer's CRM. Separate several with commas.",
  alertEmails: "Who gets the daily e-mail when a lead's car is sold or removed.",
  managerEmail: "Who is e-mailed when the AI hands a chat to a person.",
  managerPhone: "The manager's phone, for alerts.",
  callNumber: "The number the Call button on public car pages dials.",
  textNumber: "The number the Text button on public car pages texts.",
  latitude: "Map position (north–south). Use 'Find position from address'.",
  longitude: "Map position (east–west).",
  timezone: "The store's time zone, e.g. America/New_York.",
  dealershipName: "The dealership's name as customers see it.",
  chatbotName: "The name the AI uses for itself in chats.",
  dealerSource: "The dealership's website. Its stock is found by this.",
  website: "The dealership's website. Stock comes from the feed for this site.",
  currentPassword: "Your password now.",
  newPassword: "At least 12 characters, with letters and a number or symbol.",
  confirm: "Type the new password again.",
};

// ---------- 2. feature help (popups) ----------
const HELP = {
  dashboard: {
    title: "Dashboard",
    body: "Your store at a glance: cars in stock, car page views and taps, leads, appointments and chats, then Trends: charts of everything over 7, 30 or 90 days. Each card opens its section.",
    steps: ["Pick a store at the top (if you have several), or 'All stores'.", "Click a card to open that section.", "Trends: conversations per day by channel, messages (customers, AI, team), how fast customers get a first reply, when customers write (day × hour), chats by department, leads and appointments per day and where they come from, cars with the most leads, the visit-to-booking funnel, website visitors (when tracking is on), car page views and taps. AutoPulse admins on 'All stores' also see leads and conversations by store.", "Pick 7, 30 or 90 days. Hover a chart for the numbers, or press Table to see them as a table.", "Latest leads shows the five newest; click the eye to open one."],
  },
  inbox: {
    title: "Inbox",
    body: "Every customer conversation: WhatsApp, SMS, Messenger, Instagram and website chats. The AI answers; your team can take over any chat. The bar under an open chat says who is handling it and what that means for you.",
    steps: ["Pick a platform in the bar at the top, or 'All platforms'.", "Click a chat on the left to open it.", "Type in the box at the bottom and press Enter to reply: you now handle the chat and the AI steps back.", "The bar under the chat header: '✓ You're handling this chat', 'Handled by …' (Ask to take it / Take over) or 'Waiting in the … queue' (Take this chat). 'Hand off…' asks a colleague, transfers to a person or a queue, or lets the chat go back to the queue or the AI.", "Use Broadcast only for recipients with documented opt-in. It can send one approved message to up to 25 Twilio WhatsApp or SMS customers when outreach is enabled. Save them as a reusable list.", "A yellow banner at the top lists anything AutoPulse switched off for this store."],
  },
  leads: {
    title: "Leads",
    body: "Customers interested in a car, from every channel and from the website chatbot. Each new lead is e-mailed to the dealer's CRM (ADF).",
    steps: ["Use the filters to narrow the list; 'Filter' applies them.", "'By car' groups leads per vehicle.", "Click the eye to open a lead (this marks it as viewed).", "'CSV' downloads the list as a spreadsheet."],
  },
  appointments: {
    title: "Appointments",
    body: "Showroom visits booked from chats, the website and Messenger, with booking counts at the top.",
    steps: ["Filter by date, source or text.", "Click the eye for details, or the chat icon to open the conversation.", "'CSV' and 'Tracking CSV' download the lists."],
  },
  vehicles: {
    title: "Vehicles",
    body: "The store's cars: the AutoPulse car feed, the store's own cars, or both, with leads, chat mentions, page views and Call/Text/WhatsApp taps per car. Own cars carry an OWN tag.",
    steps: ["Inventory panel: tick 'AutoPulse feed' and/or 'My own cars' (AutoPulse CRM dealers always keep their feed and can add own cars next to it).", "Add car: type the VIN to fill the details, add photos, Save. Own cars have icons to edit, mark sold or delete them.", "Search or filter by make, model, body, year, price and miles; pick 'All stores' to see every store's cars.", "Click the car icon for full details; the link icon copies the public car page link."],
  },
  conversations: {
    title: "Conversations",
    body: "A log of every chat on every channel: first question, messages, follow-ups, session time, clicks and bookings.",
    steps: ["Filter by channel, date or text.", "'Order' sorts by follow-ups or by a type of click.", "Click the eye to read the whole conversation.", "'CSV' gives one row per chat; 'Transcripts CSV' gives every message."],
  },
  team: { title: "Team", body: "Who can sign in to the inbox, and what they may do. Admin: everything. Manager: the inbox and the store's settings, not the team or system pages. Agent: the inbox. AutoPulse CRM users sign in with their CRM password: change or remove them in AutoPulse CRM; here you can only disable them.", steps: ["Fill in 'Add member', pick a role and click 'Create account'.", "Change someone's role with the menu in their row (they sign in again to get it).", "Use the buttons in a row to reset a password or disable someone. They are signed out at once."] },
  activity: { title: "Activity", body: "The audit log (who did what, when), system status, messages from the public demo and contact forms, and the log of calls to outside services.", steps: ["Page through the audit log with the arrows.", "Under Website enquiries, 'Mark done' when someone has been answered.", "Under Outside services, tick 'Failures only' to see what is failing."] },
  settings: { title: "Settings", body: "Your own account, the AI switches, e-mails and alerts, and (AutoPulse admins) the AutoPulse site. Store details, the website chat, the team and pages have their own pages in the menu.", steps: ["Pick a tab at the top: My account, AI replies, E-mails & alerts, AutoPulse site.", "Each panel has its own Save button.", "Looking for the store, website chat, team or pages? Use the menu on the left."] },
  chatwidget: {
    title: "Website chat",
    body: "The chat bubble on your website. Visitors pick a department, give their name, e-mail and phone, and the AI answers from your stock; your team can reply live from the Inbox and take over any chat.",
    steps: ["Bot name, colours, logo and welcome message: change them, then Save.", "Opening hours: outside them the chat shows your after-hours message.", "Pop-up messages (panel below): the messages that pop up next to the closed chat bubble, their one-tap buttons and their timing. Edit them, watch the preview, then Save.", "Copy embed code and paste it into every page of your website (or the page footer).", "Open test page to try it like a customer, on any device.", "WhatsApp, Messenger and Instagram fields add those buttons to the chat's Contact tab.", "Visitor tracking (last panel): turn on recording of the pages and cars visitors look at, for the Visitors page."],
  },
  visitors: {
    title: "Visitors",
    body: "Everyone who browses the dealer's website while visitor tracking is on: every visit, the pages they opened (car pages, search, specials, financing, trade-in, service) and the cars they looked at, with the time they spent. A visitor is Identified when they gave their own name, e-mail and phone in the chat (100% sure), Unverified when they looked up details in the chat but didn't confirm them (a hint only, never exported), and Anonymous otherwise. The same person on a phone and a computer is one visitor once they give the same e-mail or phone.",
    steps: ["Turn tracking on first: Website chat → Visitor tracking (off, on with a notice, or ask first). Nothing is recorded while it is off.", "The cards at the top count visitors by status, returning visitors and car shoppers; click one to filter the list.", "Most viewed cars: click a car to see who looked at it. What they look at: pages by type.", "Search by name, e-mail, phone, VIN, car or visitor ID; filter by status, last visit dates, 'Looked at cars' and 'Came back'.", "View (or click a row): who they are and how we know, every visit with its pages and time, cars viewed, devices, where they came from, their chat and leads.", "Export: the visitor list or every page, as Excel or CSV (owners, managers and admins). Contact details are exported only for identified visitors.", "Delete this visitor's data: for a privacy request. Their pages and identity are deleted; their chats stay in the Inbox."],
  },
  "time-zone": {
    title: "Time zone",
    body: "How dates and times show for you everywhere in the inbox: messages, Today and Yesterday, leads, appointments, visitors, charts and the activity log. Each person chooses their own; it follows you to any computer.",
    steps: ["New York time (default): the dealers' time zone, whatever your computer is set to.", "Automatic: your computer's own time zone, as before.", "Or pick a time zone from the list, then Save time zone. Times change as the lists refresh."],
  },
  "visitor-tracking": {
    title: "Visitor tracking",
    body: "Records the pages and cars each visitor opens on your website, for the Visitors page. It never looks visitors up in outside databases: names come only from what visitors type into the chat.",
    steps: ["Off: nothing is recorded.", "On, with a notice: visits are recorded; each visitor sees your notice once (next to the chat bubble) and can turn it off in the chat's Options, which deletes what was recorded for them.", "Ask first: nothing is recorded until the visitor presses Allow.", "Global Privacy Control is always respected; 'Do Not Track' too unless you untick it. Bots are skipped.", "Keep visits for 30 to 730 days; older pages are deleted automatically.", "Add your privacy policy link, and mention visit tracking in it. Ask your lawyer which mode fits your state's law."],
  },
  store: {
    title: "Store",
    body: "Everything about the store that customers and the AI see: address and map, contact person, manager alerts, call and text numbers, what the AI knows (links and a note), and your stores.",
    steps: ["Store details: fill in the address and phones, press 'Find position from address' for the map, then Save.", "What the AI knows: add credit-application and trade-in links and a short note; open 'What the AI is told' to see the exact text.", "My stores: add another store by its website; switch stores from the Viewing menu at the top."],
  },
  staff: {
    title: "Team",
    body: "The people who answer this dealership's chats. Connect dealers add their own team. For an AutoPulse CRM dealer, the team comes from AutoPulse CRM (labelled 'From AutoPulse CRM') and you can add Connect-only people next to it.",
    steps: ["Add person: name, e-mail, role (Agent or Manager), departments and stores. Give them the temporary password shown once, or send an e-mail invite.", "Row → Edit / More: role, departments, new temporary password, resend invite, turn off, remove.", "AutoPulse CRM people: added and removed in the CRM and sign in with their CRM login. Here you set only their Connect role and departments, or turn them off in Connect; 'Use AutoPulse CRM settings' undoes your changes. 'Manage Employee' in the CRM makes a Manager.", "Departments: tick the ones your store uses; choose 'Next person online' or 'Always the queue' for new website chats.", "What each role can do: the exact rights of Owner, Manager and Agent, checked by the server."],
  },
  pages: {
    title: "Pages",
    body: "A page for the dealership and one for each person, with every way to reach you and a QR code. Every button opens the customer's own app or the website chat, so the customer always writes first. Connect dealers and subscribed AutoPulse CRM dealers have Pages.",
    steps: ["Dealership page: pick Private link or Public, set the address and department contacts (Parts included), Save, then Open page.", "My page: each person turns on their own page; website chats and WhatsApp/SMS messages that start there go to them.", "Share: copy the link or print the QR code (stickers, cards, e-mail signatures). 'New private link' retires an old link."],
  },
  "team-people": { title: "Team members", body: "Everyone on this dealership's team with role, departments, stores, status and last sign-in. 'Temporary password' means they have not chosen their own yet; 'Invite sent' means they have not opened the invite." },
  "team-roles": { title: "What each role can do", body: "One tick per action and role. The server refuses anything not ticked for your role, and says which role you have." },
  "team-departments": { title: "Departments and routing", body: "Which departments the store uses (the website chat's first question) and how new chats are given out: to the next person online in that department, or always to the department's queue. Nobody online: the chat waits in the queue and the AI keeps answering." },
  "store-page": { title: "Dealership page", body: "Your public or private page with address, hours, departments, team, cars and a QR code. Private pages only open with their link (never in search engines)." },
  "my-page": { title: "My page", body: "Your own page with 'Chat with me'. Chats that start from it come straight to you; WhatsApp and text messages carry your short code." },
  "ai-profile": { title: "What the AI knows", body: "Links the AI shares when customers ask (inventory, credit application, trade-in, website) and a short note. They are sent to the AI with the store's address, phone and hours." },
  "widget-settings": { title: "Website chat settings", body: "The chat's look, welcome message, opening hours, other-app buttons and the embed code for your website." },
  notifications: { title: "Notification e-mails", body: "Who gets an e-mail when a chat is waiting in a queue, a customer asks for a person, or a new lead arrives. In test mode they go to the test inbox." },
  "app-address": { title: "App web address", body: "The address used in every link the app makes. It is checked before saving, so it must already point at this server with HTTPS." },
  inventory: { title: "Inventory", body: "Where the store's cars come from: tick 'AutoPulse feed', 'My own cars' or both. Own cars: add them (the VIN fills the details), add photos, mark them sold, import or export a CSV. AutoPulse CRM dealers always keep their feed." },
  "settings-account": { title: "My account", body: "Your name, photo, phone and address, your template sign-off, and your password." },
  "settings-ai": { title: "AI replies", body: "Turn AI replies on or off for the whole inbox, or per platform. When off, only your team answers. A platform marked 'Off by AutoPulse' was switched off by AutoPulse for your store; your team still replies there." },
  "settings-emails": { title: "E-mails & alerts", body: "Notification e-mails for the team (chat waiting, a person asked for, new lead), where leads go as ADF e-mails (the dealer's CRM), and who gets car-sold alerts." },
  popups: {
    title: "Pop-up messages",
    body: "Messages that pop up next to the chat bubble while the chat window is closed, each with up to three one-tap buttons. Visitors can always close them or turn them off for good.",
    steps: ["Pop-up messages on: the switch at the top turns them all on or off.", "When they show: the first one after a few seconds, then one every N seconds, each staying N seconds, at most N per page. Extras: animation, the green online dot, phones, sooner when the visitor scrolls, and the 'new reply' notice.", "Messages, in order: the greeting, then reminders. Write the text ({name} = the visitor's first name, {bot} = the bot name), tick the waving hand if you like, and add buttons: each button opens the Cars tab, sends a question (and can pick the department, so the visitor skips that step), opens the booking form, asks for a person, just opens the chat, or opens a web page.", "Special messages replace the greeting for a returning visitor, on a car's page, after hours, and once when someone is about to leave the page.", "Click a message to see it in the preview (as a new or a known visitor), then Save. Try it on the test page: your website shows the change within 5 minutes.", "Start from our suggestions puts back the messages we recommend (only after you Save)."],
  },
  "store-details": {
    title: "Store details",
    body: "Everything the chatbot and the public car pages need to know about this store.",
    steps: ["Fill in the address, then 'Find position from address' to set the map position.", "Manager e-mail gets an alert when the AI hands a chat to a person.", "Call and Text numbers are used by the buttons on public car pages.", "Copy the embed code and paste it on the dealer's website (once).", "Click 'Save store details'."],
  },
  "my-stores": { title: "My stores", body: "All the stores on your account. Add a store by its website; 'Check stock' shows what the feed has first. Switch stores from the menu at the top." },
  "lead-emails": { title: "ADF lead e-mail", body: "Each new lead and appointment is e-mailed here in ADF/XML, the format dealer CRMs import. While dealer e-mail is in test mode, it goes to the test inbox instead." },
  "number-binding": { title: "This WhatsApp number", body: "Choose which dealership the WhatsApp number answers for. New chats go to that store." },
  "dealership-panel": { title: "This dealership", body: "Name, chatbot name and website of a local dealership, and adding another one." },
  "ai-replies": { title: "Incoming AI", body: "The master switch and one switch per platform for AI replies to new messages." },
  "my-profile": { title: "My profile", body: "Your name, photo, phone and address. CRM accounts keep their name from the CRM." },
  "template-details": { title: "My template details", body: "Templates sign off with your name and title, e.g. 'Hi Maria, this is Sam…'. Each person saves their own." },
  password: { title: "Change password", body: "Pick a new password (12+ characters). Other devices are signed out." },
  "audit-log": { title: "Audit log", body: "Sign-ins, changes and sends, newest first, with who and from where." },
  system: { title: "System", body: "Which channels are connected, the reply brain, and the job queue." },
  enquiries: { title: "Website enquiries", body: "Messages from the public 'Request a demo' and 'Contact' pages. Mark them done when answered." },
  "team-members": { title: "Team members", body: "Everyone who can sign in, their role and last sign-in." },
  "add-member": { title: "Add member", body: "Create a sign-in for a colleague with a temporary password. Agents see the inbox; admins see everything." },
  "latest-leads": { title: "Latest leads", body: "The five newest leads for the selected store(s)." },
  stores: {
    title: "Stores",
    body: "Every dealership on AutoPulse with its type (Connect dealer, CRM only, CRM & Connect; Test tag), whether it is Subscribed (may use Connect), contact and leads. Every store has the same Actions menu; what a store can't do is greyed out and says why.",
    steps: ["Search or filter by dealer type, subscription or date; 'Filter' applies them.", "'Add store' creates a dealer account with its store; 'Import CSV' adds many at once.", "Actions: open the store, edit its details, Store controls, Billing & payments, Subscribe / Unsubscribe, log in as the dealer, change the password or delete it.", "Subscribe = the store may use Connect (its team signs in, its website chat shows). Every store starts Unsubscribed.", "Store controls: switch the AI off for the store or per channel (the team still replies), switch channels, pop-ups, the Cars tab and car pages, booking, visitor tracking, team invites and sign-in on or off. The dealer sees what you switched off.", "'CSV' downloads the list. CRM dealers' names and staff are changed in AutoPulse CRM."],
  },
  restrictions: { title: "Switched off by AutoPulse", body: "The yellow banner on the Dashboard and Inbox lists what AutoPulse switched off for this store: not subscribed, sign-in paused, website chat off, channels, the AI on some channels, pop-ups, car pages, booking, tracking or team invites. Dealers: contact AutoPulse to turn them back on. AutoPulse admins: Stores → Actions → Store controls or Subscribe." },
  overview: { title: "AutoPulse overview", body: "Company-wide numbers (AutoPulse admins, 'All stores'): stores, customers, leads, appointments, website chats, session time and website clicks by type. Test stores are left out." },
  outbound: { title: "Outside services", body: "Every call this server made to another service: the car feed, the AI brain, Meta, Twilio, e-mail and maps, with the result and time taken. Use it to see when a service is failing." },
  "messaging-permissions": {
    title: "Messaging permissions",
    body: "Features Meta and Twilio allow when their rules are followed. The server decides what may be turned on (account approvals); here you choose what is on. Rules that protect customers are always on and have no switch.",
    steps: ["Always on: opt-outs (STOP) are honoured on every channel, free text only inside the 24-hour window, SMS broadcasts need consent and never go out from 8 PM to 8 AM store time.", "Templates after 24 hours and SMS broadcasts only go to customers with recorded consent (the green 'Opted in ✓' tag in a chat).", "A grey switch means the server does not allow it yet: DevOps turns on the named setting once Meta or Twilio has approved the account."],
  },
  consent: { title: "Consent", body: "Whether this customer agreed to get messages the store starts. 'Replies only': they haven't opted in, so you answer their messages while the reply window is open (the pill beside it shows how long is left). 'Opted in ✓': they agreed, so templates after 24 hours, SMS broadcasts and new chats are allowed too. 'Opted out': they asked to stop, so nothing can be sent until they reply START." },
  "global-settings": { title: "Global settings", body: "AutoPulse's name, support contacts, social links and logos, shown on the public pages." },
  "settings-site": { title: "AutoPulse site", body: "Global settings for AutoPulse itself: name, support e-mail and phone, social links and logos." },
};

// Where "?" icons go: a heading (or element) selector → help key.
const PANEL_HELP = [
  ["#store-panel > h3", "store-details"],
  ["#popups-panel h3", "popups"],
  ["#tracking-panel > h3", "visitor-tracking"],
  ["#timezone-panel > h3", "time-zone"],
  ["#stores-panel > h3", "my-stores"],
  ["#adf-panel > h3", "lead-emails"],
  ["#number-binding > h3", "number-binding"],
  ["#dealership-panel > h3", "dealership-panel"],
  ["#ai-settings-panel-ai > h3", "ai-replies"],
  ["#profile-panel > h3", "my-profile"],
  ["#password-panel > h3", "password"],
  ["#view-activity .enquiries-panel:not(#outbound-panel) h3", "enquiries"],
  ["#outbound-panel h3", "outbound"],
  ["#dash-overview > h3", "overview"],
  ["#site-panel > h3", "global-settings"],
  ["#messaging-panel > h3", "messaging-permissions"],
  ["#team-panel h3", "team-people"],
  ["#roles-panel > h3", "team-roles"],
  ["#departments-panel > h3", "team-departments"],
  ["#store-page-panel h3", "store-page"],
  ["#my-page-panel > h3", "my-page"],
  ["#ai-profile-panel > h3", "ai-profile"],
  ["#widget-panel > h3", "widget-settings"],
  ["#notify-panel > h3", "notifications"],
  ["#app-address-panel > h3", "app-address"],
  ["#stock-panel h3", "inventory"],
];
const HEADING_HELP = { "My template details": "template-details", "Audit log": "audit-log", System: "system", "Team members": "team-members", "Add member": "add-member", "Latest leads": "latest-leads" };

// ---------- 3. demo tours (selector + explanation; hidden steps are skipped) ----------
const TOURS = {
  inbox: [
    [".channel-bar", "Pick a platform here, or 'All platforms' to see every chat."],
    ["#search", "Search chats by name or phone number."],
    ["#new-chat-btn", "Start a new chat with a customer."],
    [".list-head .tabs", "Quick filters: unread, unreplied, needs a person, failed sends."],
    ["#contact-list", "Your chats, newest first. Click one to open it."],
    ["#stats", "Today's numbers for this inbox."],
  ],
  dashboard: [
    ["#dash-store", "Choose one store or all your stores."],
    [".dash-cards", "Key numbers. Click a card to open that section."],
    ["#view-dashboard .records-table", "The five newest leads."],
  ],
  leads: [
    ["#view-leads .seg", "'By customer' lists people; 'By car' groups leads per vehicle."],
    ["#leads-filters", "Filters: text, status, store and dates. Click 'Filter' to apply."],
    ["#leads-csv", "Download the list as a spreadsheet."],
    ["#view-leads .records-table", "Click the eye on a row to open the lead and its car."],
  ],
  appointments: [
    ["#view-appointments .stats", "Total bookings, this month, and Messenger visits and conversion."],
    ["#appts-filters", "Filter by text, dates, source and store."],
    ["#view-appointments .records-table", "Open a booking, or jump to its chat."],
  ],
  vehicles: [
    ["#veh-filters", "Search and filter the stock. 'All stores' combines your stores."],
    ["#view-vehicles .records-table", "Per car: leads, mentions in chats, page views and taps."],
  ],
  conversations: [
    ["#convs-filters", "Filter chats and choose the order (follow-ups or clicks)."],
    ["#convs-csv", "One row per chat, with booking details."],
    ["#view-conversations .records-table", "Click the eye to read a whole conversation."],
  ],
  settings: [
    ["#settings-tabs", "Settings are grouped in tabs."],
    ["#settings-grid", "Each panel has its own Save button. Look for the ? icons for details."],
  ],
  team: [["#view-team .panel", "Inbox users and adding a new one. Change someone's role in their row."]],
  visitors: [
    ["#view-visitors .guide", "What this page is for, in three steps."],
    ["#visitors-stats", "Visitors by status. Click a card to filter the list."],
    ["#visitors-cars-panel", "The cars visitors opened most. Click one to see who looked at it."],
    ["#visitors-filters", "Search, filter by status and dates, and export to Excel or CSV."],
    ["#visitors-panel .table-wrap", "Every visitor. Click a row for their visits, pages and cars."],
  ],
  chatwidget: [
    ["#view-chatwidget .guide", "What this page is for, in three steps."],
    ["#widget-panel", "The chat's look, hours and other-app buttons. Save when done."],
    ["#widget-panel textarea, #widget-panel code, #widget-panel pre", "The embed code: copy it into your website."],
  ],
  store: [
    ["#store-panel", "Store details: address, map, contacts, manager alerts, call and text numbers."],
    ["#ai-profile-panel", "What the AI knows: links and a short note."],
    ["#stores-panel", "Your stores: add one by its website."],
  ],
  staff: [
    ["#team-add-btn", "Add a person: role, departments, stores, temporary password or invite."],
    ["#team-panel", "Everyone on the team. Use Edit and More… on a row."],
    ["#departments-panel", "Departments and how new website chats are routed."],
    ["#roles-panel", "Exactly what each role can do."],
  ],
  pages: [
    ["#store-page-panel", "Your dealership page: who can open it, its address and department contacts."],
    ["#my-page-panel", "Your own page with 'Chat with me'."],
  ],
  stores: [
    ["#stores-filters", "Search and filter stores; CSV, Import CSV and Add store are here too."],
    ["#view-stores .records-table", "Each store with its contact, subscription and leads. Use 'Actions…' on a row."],
  ],
  activity: [["#view-activity .panel", "Audit log and system status."], ["#view-activity .enquiries-panel", "Demo and contact form messages."]],
};

// ---------- tooltip ----------
let tipEl = null;
let tipTimer = null;
let tipFor = null;

function labelText(el) {
  if (el.id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) return forLabel.textContent.trim();
  }
  const wrap = el.closest("label");
  const span = wrap?.querySelector(":scope > span");
  return (span || wrap)?.textContent.trim().replace(/\s+/g, " ") || "";
}

function tipFor_(el) {
  if (el.dataset.tip) return el.dataset.tip;
  if (el.id && TIPS[el.id]) return TIPS[el.id];
  if (el.title) {
    el.dataset.tip = el.title; // take over the browser's own tooltip
    el.removeAttribute("title");
    return el.dataset.tip;
  }
  if (el.name && FIELD_TIPS[el.name]) return FIELD_TIPS[el.name];
  const aria = el.getAttribute("aria-label");
  const text = el.textContent?.trim().replace(/\s+/g, " ");
  if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
    const label = labelText(el);
    const place = el.getAttribute("placeholder");
    if (el.tagName === "SELECT") return label ? `Choose ${label.toLowerCase()}.` : aria ? `${aria}.` : "Choose an option.";
    if (el.type === "checkbox") return label || aria || "";
    return label ? `${label}${place ? ` — e.g. ${place}` : ""}` : aria || place || "";
  }
  if (aria && aria !== text) return aria;
  if (el.tagName === "A" && el.href && !text) return "Open link";
  return text && text.length <= 40 ? (el.tagName === "A" ? `Open ${text}` : text) : "";
}

function placeTip(el, text) {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "help-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.append(tipEl);
  }
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return; // not on screen
  tipEl.textContent = text;
  tipEl.hidden = false;
  const t = tipEl.getBoundingClientRect();
  let top = r.top - t.height - 8;
  if (top < 6) top = r.bottom + 8;
  const left = Math.min(Math.max(6, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 6);
  tipEl.style.top = `${Math.round(top)}px`;
  tipEl.style.left = `${Math.round(left)}px`;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  if (tipEl) tipEl.hidden = true;
}

const CONTROLS = "button, a[href], input:not([type=hidden]), select, textarea, [role=tab], .rail-btn";

function onOver(event) {
  const el = event.target.closest?.(CONTROLS);
  if (!el || el === tipFor || el.closest(".help-pop, .help-tour")) return;
  const text = tipFor_(el);
  hideTip();
  if (!text) return;
  tipFor = el;
  tipTimer = setTimeout(() => { if (tipFor === el && el.isConnected) placeTip(el, text); }, event.type === "focusin" ? 0 : TIP_DELAY);
}

function onOut(event) {
  const el = event.target.closest?.(CONTROLS);
  if (el && el === tipFor && !el.contains(event.relatedTarget)) hideTip();
}

// ---------- popups ----------
let popEl = null;

function closePop() {
  popEl?.remove();
  popEl = null;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c) node.append(c);
  return node;
}

// The private feature & test sheet: AutoPulse admins get its link in every Help pop-up (others get a 403 and no link).
let sheetUrl = null;
let sheetAsked = false;
async function loadSheetUrl() {
  if (sheetAsked) return;
  sheetAsked = true;
  try {
    const r = await fetch("/api/admin/feature-sheet", { credentials: "same-origin" });
    if (r.ok) sheetUrl = (await r.json()).url || null;
  } catch {
    sheetUrl = null;
  }
}

function sheetLink() {
  return sheetUrl ? el("a", { class: "btn btn-sm help-sheet-link", href: sheetUrl, target: "_blank", rel: "noopener noreferrer" }, "Feature & test sheet") : null;
}

export function openHelp(key, { tourKey = null } = {}) {
  const help = HELP[key];
  if (!help) return;
  closePop();
  hideTip();
  const tour = TOURS[tourKey || key];
  popEl = el("div", { class: "help-pop-backdrop", onclick: (e) => { if (e.target === popEl) closePop(); } },
    el("div", { class: "help-pop", role: "dialog", "aria-modal": "true", "aria-label": help.title },
      el("div", { class: "help-pop-head" },
        el("span", { class: "help-pop-badge", text: "?" }),
        el("h3", { text: help.title }),
        el("button", { type: "button", class: "icon-btn help-pop-close", "aria-label": "Close", onclick: closePop }, "×")),
      el("p", { text: help.body }),
      help.steps?.length ? el("div", {}, el("h4", { text: "How to use it" }), el("ol", {}, help.steps.map((s) => el("li", { text: s })))) : null,
      el("div", { class: "help-pop-actions" },
        tour ? el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => { closePop(); startTour(tourKey || key); } }, "Show me") : null,
        el("button", { type: "button", class: "btn btn-sm", onclick: closePop }, "Got it"),
        el("a", { class: "btn btn-sm help-manual-link", href: "/manual", target: "_blank", rel: "noopener" }, "User manual"),
        sheetLink(),
        el("label", { class: "help-pop-hide" },
          el("input", { type: "checkbox", onchange: (e) => setIconsHidden(e.target.checked) }),
          " Hide ? icons"))));
  document.body.append(popEl);
  popEl.querySelector(".help-pop-close").focus();
  // First Help of the session: ask once whether this person may see the sheet, then add the link.
  if (!sheetAsked) {
    const pop = popEl;
    loadSheetUrl().then(() => {
      const link = sheetLink();
      if (link && pop.isConnected) pop.querySelector(".help-pop-actions")?.append(link);
    });
  }
}

// ---------- tours ----------
let tour = null;

function endTour() {
  tour?.layer.remove();
  tour = null;
}

function showStep(index) {
  const steps = tour.steps;
  if (index < 0 || index >= steps.length) return endTour();
  tour.index = index;
  const [selector, text] = steps[index];
  const target = document.querySelector(selector);
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  const r = target.getBoundingClientRect();
  const pad = 6;
  Object.assign(tour.spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  tour.text.textContent = text;
  tour.count.textContent = `${index + 1} of ${steps.length}`;
  tour.back.disabled = index === 0;
  tour.next.textContent = index === steps.length - 1 ? "Done" : "Next";
  const box = tour.box.getBoundingClientRect();
  let top = r.bottom + 12;
  if (top + box.height > innerHeight - 8) top = Math.max(8, r.top - box.height - 12);
  const left = Math.min(Math.max(8, r.left), innerWidth - box.width - 8);
  Object.assign(tour.box.style, { top: `${top}px`, left: `${left}px` });
  tour.next.focus();
}

export function startTour(key) {
  const visible = (TOURS[key] || []).filter(([sel]) => {
    const node = document.querySelector(sel);
    return node && node.getClientRects().length && !node.closest("[hidden]");
  });
  if (!visible.length) return;
  endTour();
  const spot = el("div", { class: "help-tour-spot" });
  const text = el("p");
  const count = el("span", { class: "muted" });
  const back = el("button", { type: "button", class: "btn btn-sm", onclick: () => showStep(tour.index - 1) }, "Back");
  const next = el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => showStep(tour.index + 1) }, "Next");
  const box = el("div", { class: "help-tour-box", role: "dialog", "aria-live": "polite" }, text,
    el("div", { class: "help-tour-actions" }, count, el("span", { class: "spacer" }), el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: endTour }, "Skip"), back, next));
  const layer = el("div", { class: "help-tour", onclick: (e) => { if (e.target === layer) endTour(); } }, spot, box);
  document.body.append(layer);
  tour = { steps: visible, index: 0, layer, spot, box, text, count, back, next };
  showStep(0);
}

// ---------- "Show me in the app" (from the feature & test sheet) ----------
// The sheet links to /admin#view=<view>&find={label, sel, panel, hint, note}. app.js opens the screen; here we find
// the button or panel (by id, else by its name inside the named panel), scroll to it and highlight it.
// If it is not on screen yet (e.g. it needs an open chat), the box says what to do first and offers "Try again".
const normText = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const shown = (n) => Boolean(n && n.getClientRects().length && !n.closest("[hidden]"));

function panelBox(name, scope) {
  const want = normText(name);
  const head = [...scope.querySelectorAll("h2, h3, h4, legend, summary")]
    .find((x) => shown(x) && normText(x.textContent).replace(/\s*\?$/, "").startsWith(want));
  if (!head) return null;
  const box = head.closest("details, fieldset, section, .card, .panel") || head.parentElement;
  if (box?.tagName === "DETAILS") box.open = true;
  return box;
}

function findTarget(t) {
  if (t.sel) {
    const n = [...document.querySelectorAll(t.sel)].find(shown);
    if (n) return n;
  }
  let scope = document.getElementById(`view-${t.view}`) || document.body;
  if (t.panel) {
    const box = panelBox(t.panel, scope);
    if (box && !t.label) return box;
    if (box) scope = box;
  }
  if (!t.label) return null;
  const want = normText(t.label);
  const nodes = [...scope.querySelectorAll("button, a, [role=button], [role=tab], summary, label")].filter(shown);
  const names = (n) => [n.textContent, n.getAttribute("aria-label"), n.getAttribute("title"), n.dataset.tip].map(normText);
  return nodes.find((n) => names(n).includes(want))
    || nodes.find((n) => names(n).some((x) => x && x.startsWith(want)))
    || nodes.find((n) => names(n).some((x) => x && want.length > 3 && x.includes(want)))
    || null;
}

let finder = null;
function endFind() {
  finder?.layer.remove();
  finder = null;
}

function showFind(t, node) {
  endFind();
  const name = t.label || t.panel;
  const text = el("p", {}, el("b", { text: node ? `Here it is: “${name}”.` : `“${name}” is not on the screen yet.` }), " ",
    node ? (t.note || "") : (t.hint || "Scroll the page or open the part it belongs to, then press Try again."));
  const again = el("button", { type: "button", class: "btn btn-sm", onclick: () => { endFind(); lookFor(t, 8); } }, "Try again");
  const box = el("div", { class: "help-tour-box", role: "dialog", "aria-live": "polite" }, text,
    el("div", { class: "help-tour-actions" }, el("span", { class: "spacer" }), node ? null : again,
      el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: endFind }, node ? "Got it" : "Close")));
  if (!node) {
    // Nothing to point at: keep the page usable (no dark cover) so the tester can open the chat or panel first.
    Object.assign(box.style, { right: "16px", bottom: "16px", zIndex: "1950" });
    document.body.append(box);
    finder = { layer: box };
    return;
  }
  const spot = el("div", { class: "help-tour-spot" });
  const layer = el("div", { class: "help-tour", onclick: (e) => { if (e.target === layer) endFind(); } }, spot, box);
  document.body.append(layer);
  finder = { layer };
  node.scrollIntoView({ block: "center", inline: "nearest" });
  requestAnimationFrame(() => {
    const r = node.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const b = box.getBoundingClientRect();
    let top = r.bottom + 12;
    if (top + b.height > innerHeight - 8) top = Math.max(8, r.top - b.height - 12);
    const left = Math.min(Math.max(8, r.left), innerWidth - b.width - 8);
    Object.assign(box.style, { top: `${top}px`, left: `${left}px` });
  });
}

// Screens load their data after opening, so keep looking for a few seconds before saying it is not there.
function lookFor(t, tries = 20) {
  const node = findTarget(t);
  if (node || tries <= 0) return showFind(t, node);
  setTimeout(() => lookFor(t, tries - 1), 300);
}

export function findOnPage(t) {
  if (!t || (!t.label && !t.sel && !t.panel)) return;
  window.__autopulseFind = null;
  setTimeout(() => lookFor(t), 400);
}

// ---------- ? icons ----------
function iconsHidden() {
  try { return localStorage.getItem(STORE_KEY) === "hidden"; } catch { return false; }
}

function setIconsHidden(hidden) {
  try { localStorage.setItem(STORE_KEY, hidden ? "hidden" : "shown"); } catch { /* private mode */ }
  document.documentElement.classList.toggle("help-icons-off", hidden);
}

function helpIcon(key, label) {
  return el("button", { type: "button", class: "help-q", "data-help-key": key, "aria-label": `About ${label}`, "data-tip": `What is ${label}?` }, "?");
}

function currentView() {
  return document.querySelector(".rail-btn.active[data-view]")?.dataset.view || "inbox";
}

function addIcons() {
  const title = document.getElementById("view-title");
  if (title && !document.getElementById("help-view")) {
    const btn = helpIcon("view", "this screen");
    btn.id = "help-view";
    title.after(btn);
  }
  for (const [selector, key] of PANEL_HELP) {
    for (const heading of document.querySelectorAll(selector)) {
      if (!heading.querySelector(".help-q")) heading.append(" ", helpIcon(key, HELP[key].title));
    }
  }
  for (const heading of document.querySelectorAll(".view h3")) {
    const key = HEADING_HELP[heading.firstChild?.textContent?.trim()];
    if (key && !heading.querySelector(".help-q")) heading.append(" ", helpIcon(key, HELP[key].title));
  }
  const tabs = document.getElementById("settings-tabs");
  if (tabs && !tabs.querySelector(".help-q")) {
    const btn = helpIcon("settings-tab", "this tab");
    tabs.append(btn);
  }
}

function onHelpClick(event) {
  const open = event.target.closest("[data-help-open]");
  if (open) {
    event.preventDefault();
    const key = open.dataset.helpOpen;
    openHelp(key, { tourKey: TOURS[key] ? key : null });
    return;
  }
  const btn = event.target.closest(".help-q, #help-btn");
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  let key = btn.dataset.helpKey;
  const view = currentView();
  if (btn.id === "help-btn" || key === "view") key = view;
  if (key === "settings-tab") key = `settings-${document.getElementById("settings-grid")?.dataset.active || "account"}`;
  openHelp(key, { tourKey: TOURS[key] ? key : null });
}

export function initHelp() {
  if (iconsHidden()) document.documentElement.classList.add("help-icons-off");
  document.addEventListener("mouseover", onOver);
  document.addEventListener("focusin", onOver);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("focusout", hideTip);
  document.addEventListener("scroll", hideTip, true);
  document.addEventListener("click", onHelpClick, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (tour) endTour();
    else if (finder) endFind();
    else if (popEl) closePop();
  });
  // "Show me in the app" from the feature & test sheet (app.js may have handed it over before this file loaded).
  document.addEventListener("autopulse:find", (e) => findOnPage(e.detail));
  if (window.__autopulseFind) findOnPage(window.__autopulseFind);
  addIcons();
  // Panels and headings that appear later (after loading, role checks) get their icon too.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; addIcons(); });
  }).observe(document.body, { childList: true, subtree: true });
}

initHelp();
