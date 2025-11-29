# Node.js Version Requirements

## Required Version

This project requires **Node.js >= 18.17.0** (Next.js 14+ requirement).

## Using nvm (Node Version Manager)

The project includes a `.nvmrc` file that specifies Node.js version 20.

### Automatic Version Switching

When you `cd` into the project directory, nvm will automatically use the correct version if you have this in your `~/.bashrc` or `~/.zshrc`:

```bash
# Add to ~/.bashrc or ~/.zshrc
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Auto-switch Node.js version when entering directory with .nvmrc
cdnvm() {
    command cd "$@" || return $?
    nvm_path=$(nvm_find_up .nvmrc | tr -d '\n')

    if [[ ! $nvm_path = *[^[:space:]]* ]]; then
        declare default_version;
        default_version=$(nvm version default);

        if [[ $default_version != "$(nvm version)" ]]; then
            nvm use default > /dev/null;
        fi

        elif [[ -s $nvm_path/.nvmrc && -r $nvm_path/.nvmrc ]]; then
        declare nvm_version
        nvm_version=$(<"$nvm_path"/.nvmrc)

        declare locally_resolved_nvm_version
        locally_resolved_nvm_version=$(nvm ls --no-colors "$nvm_version" | tail -1 | tr -d '\n ')

        if [[ "$locally_resolved_nvm_version" == "N/A" ]]; then
            nvm install "$nvm_version";
        elif [[ $(nvm version "$nvm_version") != "$locally_resolved_nvm_version" ]]; then
            nvm install "$nvm_version";
        fi

        if [[ $(nvm current) != "$nvm_version" ]]; then
            nvm use "$nvm_version";
        fi
    fi
}
alias cd='cdnvm'
```

### Manual Version Switching

If auto-switching is not configured, manually switch versions:

```bash
# In the project directory
nvm use
# or
nvm use 20
```

### Installing Node.js 20

If Node.js 20 is not installed:

```bash
nvm install 20
nvm use 20
nvm alias default 20  # Set as default
```

## Verifying Version

Check your current Node.js version:

```bash
node --version
```

Should show: `v20.x.x` or `v18.17.0+`

## Troubleshooting

- **Wrong version**: Run `nvm use` in the project directory
- **nvm not found**: Install nvm or source it: `source ~/.nvm/nvm.sh`
- **Permission errors**: Make sure nvm is properly installed and configured

