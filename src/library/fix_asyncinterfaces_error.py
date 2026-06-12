#!/usr/bin/env python3
"""
Standalone script to fix Microsoft.Bcl.AsyncInterfaces assembly version mismatch error.
This script can be run directly to fix the specific error mentioned in the problem.
"""

import os
import sys
from assembly_version_fixer import AssemblyVersionFixer

def fix_asyncinterfaces_error_standalone(project_path):
    """
    Fix the specific Microsoft.Bcl.AsyncInterfaces error:
    Could not load file or assembly 'Microsoft.Bcl.AsyncInterfaces, Version=9.0.0.7'
    """
    print("=" * 60)
    print("Microsoft.Bcl.AsyncInterfaces Assembly Error Fixer")
    print("=" * 60)
    
    if not os.path.exists(project_path):
        print(f"Error: Project path '{project_path}' does not exist!")
        return False
    
    print(f"Project Path: {project_path}")
    
    # Create the fixer instance
    fixer = AssemblyVersionFixer()
    
    # Define the assembly information based on the error
    assembly_info = {
        'name': 'Microsoft.Bcl.AsyncInterfaces',
        'expected_version': '9.0.0.7',
        'new_version': '9.0.0.7',
        'old_version': '9.0.0.6',
        'public_key_token': 'cc7b13ffcd2ddd51'
    }
    
    print(f"Fixing assembly: {assembly_info['name']}")
    print(f"Target version: {assembly_info['new_version']}")
    
    # Check current configuration
    config_path = os.path.join(project_path, "App.config")
    web_config_path = os.path.join(project_path, "web.config")
    
    existing_config = None
    if os.path.exists(web_config_path):
        existing_config = web_config_path
        print(f"Found existing web.config: {web_config_path}")
    elif os.path.exists(config_path):
        existing_config = config_path
        print(f"Found existing App.config: {config_path}")
    else:
        print("No configuration file found, will create App.config")
    
    # Apply the fix
    try:
        fixer.create_or_update_app_config(project_path, assembly_info)
        
        # Verify the fix was applied
        final_config = web_config_path if os.path.exists(web_config_path) else config_path
        if os.path.exists(final_config):
            print(f"✓ Successfully updated configuration: {final_config}")
            
            # Show the binding redirect that was added
            print("\nBinding redirect added:")
            print(f"  Assembly: {assembly_info['name']}")
            print(f"  Old Version Range: 0.0.0.0-{assembly_info['new_version']}")
            print(f"  New Version: {assembly_info['new_version']}")
            print(f"  Public Key Token: {assembly_info['public_key_token']}")
            
            return True
        else:
            print("✗ Configuration file was not created successfully")
            return False
            
    except Exception as e:
        print(f"✗ Error applying fix: {str(e)}")
        return False

def main():
    """Main entry point for standalone execution"""
    if len(sys.argv) != 2:
        print("Usage: python fix_asyncinterfaces_error.py <project_path>")
        print("Example: python fix_asyncinterfaces_error.py ../test_project")
        sys.exit(1)
    
    project_path = sys.argv[1]
    
    # Convert to absolute path
    project_path = os.path.abspath(project_path)
    
    success = fix_asyncinterfaces_error_standalone(project_path)
    
    if success:
        print("\n" + "=" * 60)
        print("✓ Fix completed successfully!")
        print("You can now try building/running your project again.")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("✗ Fix failed!")
        print("Please check the error messages above.")
        print("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    main()