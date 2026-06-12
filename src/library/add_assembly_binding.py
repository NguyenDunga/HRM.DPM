#!/usr/bin/env python3
"""
Script to easily add new assembly bindings to config.yaml
This makes it simple to add new assembly bindings when you encounter errors.
"""

import sys
import yaml
from assembly_version_fixer import AssemblyVersionFixer

def add_assembly_binding(name, version, public_key_token=None, old_version_range=None, description=None, is_custom=True):
    """Add a new assembly binding to config.yaml"""
    
    try:
        # Load current config
        with open('config.yaml', 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
    except FileNotFoundError:
        print("Error: config.yaml not found!")
        return False
    except Exception as e:
        print(f"Error loading config.yaml: {e}")
        return False
    
    # Ensure assembly_bindings section exists
    if 'assembly_bindings' not in config:
        config['assembly_bindings'] = {
            'common_assemblies': [],
            'custom_assemblies': [],
            'settings': {
                'auto_apply_common': True,
                'auto_detect_mismatches': True,
                'backup_configs': True,
                'create_missing_config': True
            }
        }
    
    # Create assembly entry
    assembly_entry = {
        'name': name,
        'version': version
    }
    
    if public_key_token:
        assembly_entry['public_key_token'] = public_key_token
    
    if old_version_range:
        assembly_entry['old_version_range'] = old_version_range
    else:
        assembly_entry['old_version_range'] = f'0.0.0.0-{version}'
    
    if description:
        assembly_entry['description'] = description
    
    # Determine where to add the assembly
    section = 'custom_assemblies' if is_custom else 'common_assemblies'
    
    # Check if assembly already exists
    existing_assemblies = config['assembly_bindings'].get(section, [])
    assembly_found = False
    
    if existing_assemblies:
        for existing in existing_assemblies:
            if existing['name'].lower() == name.lower():
                print(f"Assembly '{name}' already exists in {section}. Updating...")
                existing.update(assembly_entry)
                assembly_found = True
                break
    
    if not assembly_found:
        # Add new assembly
        if section not in config['assembly_bindings'] or config['assembly_bindings'][section] is None:
            config['assembly_bindings'][section] = []
        config['assembly_bindings'][section].append(assembly_entry)
        print(f"Added new assembly '{name}' to {section}")
    
    # Write back to config.yaml
    try:
        with open('config.yaml', 'w', encoding='utf-8') as f:
            yaml.dump(config, f, default_flow_style=False, indent=2, sort_keys=False)
        print(f"Successfully updated config.yaml")
        return True
    except Exception as e:
        print(f"Error writing config.yaml: {e}")
        return False

def extract_from_error_text(error_text):
    """Extract assembly information from error text"""
    fixer = AssemblyVersionFixer()
    return fixer.analyze_assembly_error(error_text)

def interactive_add():
    """Interactive mode to add assembly binding"""
    print("=== Add Assembly Binding to config.yaml ===")
    print()
    
    # Get assembly name
    name = input("Assembly name (e.g., Microsoft.Bcl.AsyncInterfaces): ").strip()
    if not name:
        print("Assembly name is required!")
        return False
    
    # Get version
    version = input("Version (e.g., 9.0.0.7): ").strip()
    if not version:
        print("Version is required!")
        return False
    
    # Get public key token (optional)
    public_key_token = input("Public key token (optional): ").strip()
    if not public_key_token:
        public_key_token = None
    
    # Get old version range (optional)
    old_version_range = input(f"Old version range (default: 0.0.0.0-{version}): ").strip()
    if not old_version_range:
        old_version_range = None
    
    # Get description (optional)
    description = input("Description (optional): ").strip()
    if not description:
        description = None
    
    # Ask if it's custom or common
    is_custom = input("Is this a custom assembly? (y/N): ").strip().lower() in ['y', 'yes']
    
    print("\nAssembly binding to add:")
    print(f"  Name: {name}")
    print(f"  Version: {version}")
    if public_key_token:
        print(f"  Public Key Token: {public_key_token}")
    print(f"  Old Version Range: {old_version_range or f'0.0.0.0-{version}'}")
    if description:
        print(f"  Description: {description}")
    print(f"  Section: {'custom_assemblies' if is_custom else 'common_assemblies'}")
    
    confirm = input("\nAdd this assembly binding? (Y/n): ").strip().lower()
    if confirm in ['', 'y', 'yes']:
        return add_assembly_binding(name, version, public_key_token, old_version_range, description, is_custom)
    else:
        print("Cancelled.")
        return False

def main():
    """Main entry point"""
    if len(sys.argv) == 1:
        # Interactive mode
        success = interactive_add()
    elif len(sys.argv) >= 3:
        # Command line mode
        name = sys.argv[1]
        version = sys.argv[2]
        public_key_token = sys.argv[3] if len(sys.argv) > 3 else None
        old_version_range = sys.argv[4] if len(sys.argv) > 4 else None
        
        success = add_assembly_binding(name, version, public_key_token, old_version_range)
    elif sys.argv[1] == '--from-error':
        # Extract from error text
        if len(sys.argv) < 3:
            print("Usage: python add_assembly_binding.py --from-error '<error_text>'")
            sys.exit(1)
        
        error_text = sys.argv[2]
        assembly_info = extract_from_error_text(error_text)
        
        if not assembly_info.get('name'):
            print("Could not extract assembly information from error text!")
            sys.exit(1)
        
        print(f"Extracted assembly info: {assembly_info}")
        
        success = add_assembly_binding(
            assembly_info['name'],
            assembly_info.get('expected_version', assembly_info.get('new_version')),
            assembly_info.get('public_key_token'),
            assembly_info.get('old_version_range'),
            f"Auto-detected from error log: {assembly_info['name']}"
        )
    else:
        print("Usage:")
        print("  python add_assembly_binding.py  # Interactive mode")
        print("  python add_assembly_binding.py <name> <version> [public_key_token] [old_version_range]")
        print("  python add_assembly_binding.py --from-error '<error_text>'")
        print()
        print("Examples:")
        print("  python add_assembly_binding.py Microsoft.Bcl.AsyncInterfaces 9.0.0.7 cc7b13ffcd2ddd51")
        print("  python add_assembly_binding.py --from-error 'Could not load file or assembly...'")
        sys.exit(1)
    
    if success:
        print("\n✓ Assembly binding added successfully!")
        print("You can now run the main script to apply the binding to your projects.")
    else:
        print("\n✗ Failed to add assembly binding!")
        sys.exit(1)

if __name__ == "__main__":
    main()