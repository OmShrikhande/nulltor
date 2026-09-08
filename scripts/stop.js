const { spawnSync } = require('child_process');
const os = require('os');

const ports = [3330, 8001];

console.log(`\x1b[33m[*] Clearing Nulltor runtime ports: ${ports.join(', ')}...\x1b[0m`);

if (os.platform() === 'win32') {
    const script = `
        Get-NetTCPConnection -LocalPort 3330,8001 -ErrorAction SilentlyContinue | 
        ForEach-Object { 
            if ($_.OwningProcess -and $_.OwningProcess -gt 0) { 
                Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
            } 
        }
    `;
    spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' });
} else {
    for (const port of ports) {
        try {
            spawnSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
        } catch (e) {}
    }
}

console.log('\x1b[32m[✓] Nulltor processes stopped and ports cleared.\x1b[0m');
