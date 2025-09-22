# Outlook Account Creation Backend

A structured Node.js backend project for automated Outlook account creation using Puppeteer with stealth capabilities.

## Features

- Automated Outlook account creation
- Human-like browser behavior to avoid detection
- Email variation generation for availability checking
- Press-and-hold captcha handling
- Form filling with React-safe input methods
- Success detection and account saving
- Modular and maintainable code structure

## Project Structure

```
outlook-backend/
├── src/
│   ├── index.js              # Main entry point
│   ├── helpers/
│   │   ├── browser.js        # Browser configuration and frame helpers
│   │   └── input.js          # Input handling and form interaction
│   ├── handlers/
│   │   ├── captcha.js        # Captcha detection and handling
│   │   └── form.js           # Form filling logic
│   └── utils/
│       ├── constants.js      # Configuration constants
│       ├── helpers.js        # Utility functions
│       ├── detection.js      # Step and success detection
│       └── storage.js        # File system operations
├── package.json
└── README.md
```

## Installation

1. Navigate to the project directory:
```bash
cd outlook-backend
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Command Line Usage

```bash
# Run with command line arguments
npm start -- FirstName LastName

# Or run and enter details interactively
npm start
```

### Development Mode

```bash
npm run dev
```

## Configuration

The project uses various timing constants and browser arguments defined in `src/utils/constants.js`:

- **Timings**: Navigation timeouts, action delays, and verification waits
- **Browser Arguments**: Stealth configuration and human-like behavior settings
- **URLs**: Outlook signup endpoints
- **Password**: Default account password

## How It Works

1. **Browser Setup**: Launches a stealth-configured Chromium browser
2. **Navigation**: Goes to Outlook signup page
3. **Email Selection**: Tries various email variations until an available one is found
4. **Form Filling**: Progresses through password, name, and date of birth forms
5. **Captcha Handling**: Detects and solves press-and-hold captcha challenges
6. **Success Detection**: Monitors for successful account creation
7. **Account Saving**: Stores successful accounts in `completed.txt`

## Dependencies

- `puppeteer-extra`: Enhanced Puppeteer with plugin support
- `puppeteer-extra-plugin-stealth`: Stealth plugin to avoid detection

## Notes

- The browser runs in non-headless mode for debugging
- Accounts are saved to `completed.txt` in the project root
- The script includes extensive error handling and retry logic
- Human-like timing and behavior patterns are used throughout

## License

ISC
