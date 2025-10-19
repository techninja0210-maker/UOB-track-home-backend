# Update .env file with secure keys
$envFile = ".env"
$content = Get-Content $envFile

# Replace the encryption key
$content = $content -replace "WALLET_ENCRYPTION_KEY=CHANGE-THIS-TO-SECURE-32BYTE-KEY!!", "WALLET_ENCRYPTION_KEY=711eb4f77d4872594964ed0ab915035b7d6668669e6395d12b757955416f9d00"

# Replace the master seed
$content = $content -replace "MASTER_WALLET_SEED=your twelve or twenty four word mnemonic seed phrase goes here change this now", "MASTER_WALLET_SEED=divorce slab rubber expand result horror april erosion danger steel tired violin virus road often meat page flavor false trend helmet hen alone guide"

# Write back to file
$content | Set-Content $envFile

Write-Host "✅ .env file updated with secure keys!"
Write-Host "🔐 WALLET_ENCRYPTION_KEY: Set to 32-byte secure key"
Write-Host "MASTER_WALLET_SEED: Set to 24-word mnemonic"
