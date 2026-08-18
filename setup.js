const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function runCommand(command, args, cwd = process.cwd(), env = process.env) {
    console.log(`\x1b[36m> Running: ${command} ${args.join(' ')}\x1b[0m`);
    const result = spawnSync(command, args, {
        cwd,
        env,
        stdio: 'inherit',
        shell: true
    });
    
    if (result.error || result.status !== 0) {
        console.error(`\x1b[31m[!] Command failed with status ${result.status}\x1b[0m`);
        process.exit(result.status || 1);
    }
}

function getPythonCommand() {
    // Try to find the best python command
    const commands = os.platform() === 'win32' ? ['python', 'py'] : ['python3', 'python'];
    for (const cmd of commands) {
        const result = spawnSync(cmd, ['--version'], { shell: true });
        if (result.status === 0) {
            return cmd;
        }
    }
    console.error('\x1b[31m[!] Python 3 not found on this system.\x1b[0m');
    process.exit(1);
}

function main() {
    console.log('\x1b[35m======================================================\x1b[0m');
    console.log('\x1b[35m   NULLTOR GLOBAL SETUP INITIALIZATION\x1b[0m');
    console.log('\x1b[35m======================================================\x1b[0m');

    const rootDir = process.cwd();
    const frontendDir = path.join(rootDir, 'frontend');
    const backendDir = path.join(rootDir, 'backend');

    // 1. Install Node Dependencies in Root
    console.log('\n\x1b[33m[1/5] Installing Root Node Dependencies...\x1b[0m');
    runCommand('npm', ['install'], rootDir);

    // 2. Install Node Dependencies in Frontend
    console.log('\n\x1b[33m[2/5] Installing Frontend Node Dependencies...\x1b[0m');
    runCommand('npm', ['install'], frontendDir);

    // 3. Build Frontend
    console.log('\n\x1b[33m[3/5] Building React Frontend...\x1b[0m');
    runCommand('npm', ['run', 'build'], frontendDir);

    // 4. Setup Python Virtual Environment
    console.log('\n\x1b[33m[4/5] Setting up Python Virtual Environment...\x1b[0m');
    const pythonCmd = getPythonCommand();
    const venvDir = path.join(backendDir, 'venv');
    
    // Create .env if it doesn't exist
    const envFile = path.join(rootDir, '.env');
    const envExample = path.join(rootDir, '.env.example');
    if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
        console.log('\n\x1b[33m[*] Creating .env from .env.example...\x1b[0m');
        fs.copyFileSync(envExample, envFile);
        console.log('Created .env. Please update it with your API keys if needed.');
    }
    
    if (!fs.existsSync(venvDir)) {
        runCommand(pythonCmd, ['-m', 'venv', 'venv'], backendDir);
    } else {
        console.log('Virtual environment already exists, skipping creation.');
    }

    // 5. Install Python Dependencies
    console.log('\n\x1b[33m[5/5] Installing Python Dependencies...\x1b[0m');
    let pipCmd;
    if (os.platform() === 'win32') {
        pipCmd = path.join(venvDir, 'Scripts', 'pip');
    } else {
        pipCmd = path.join(venvDir, 'bin', 'pip');
    }
    runCommand(pipCmd, ['install', '-r', 'requirements.txt'], backendDir);

    console.log('\n\x1b[32m======================================================\x1b[0m');
    console.log('\x1b[32m   SETUP COMPLETE!\x1b[0m');
    console.log('\x1b[32m   You can now run: npm start\x1b[0m');
    console.log('\x1b[32m======================================================\x1b[0m');
}

main();
