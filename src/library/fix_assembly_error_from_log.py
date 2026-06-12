#!/usr/bin/env python3
"""
General script to fix assembly version mismatch errors from error log text.
This script can parse error logs and automatically fix assembly version mismatches.
"""

import os
import sys
from assembly_version_fixer import AssemblyVersionFixer

def fix_from_error_log(project_path, error_log_file=None, error_text=None):
    """
    Fix assembly version mismatch from error log file or error text
    """
    print("=" * 60)
    print("Assembly Version Mismatch Error Fixer")
    print("=" * 60)
    
    if not os.path.exists(project_path):
        print(f"Error: Project path '{project_path}' does not exist!")
        return False
    
    # Get error text from file or parameter
    if error_log_file and os.path.exists(error_log_file):
        with open(error_log_file, 'r', encoding='utf-8') as f:
            error_text = f.read()
        print(f"Reading error log from: {error_log_file}")
    elif not error_text:
        print("Error: No error log file or error text provided!")
        return False
    
    print(f"Project Path: {project_path}")
    
    # Create the fixer instance
    fixer = AssemblyVersionFixer()
    
    # Analyze the error
    assembly_info = fixer.analyze_assembly_error(error_text)
    
    if not assembly_info.get('name'):
        print("Could not extract assembly name from error text!")
        print("Please check that the error text contains assembly loading errors.")
        return False
    
    print(f"Detected assembly error for: {assembly_info['name']}")
    if 'expected_version' in assembly_info:
        print(f"Expected version: {assembly_info['expected_version']}")
    if 'old_version' in assembly_info and 'new_version' in assembly_info:
        print(f"Version redirect: {assembly_info['old_version']} -> {assembly_info['new_version']}")
    
    # Apply the fix
    try:
        success = fixer.fix_assembly_version_mismatch(project_path, error_text=error_text)
        
        if success:
            print("✓ Successfully applied assembly version fix!")
            return True
        else:
            print("✗ Failed to apply assembly version fix!")
            return False
            
    except Exception as e:
        print(f"✗ Error applying fix: {str(e)}")
        return False

def main():
    """Main entry point for standalone execution"""
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python fix_assembly_error_from_log.py <project_path> <error_log_file>")
        print("  python fix_assembly_error_from_log.py <project_path> --error-text '<error_text>'")
        print()
        print("Examples:")
        print("  python fix_assembly_error_from_log.py ../test_project error.log")
        print("  python fix_assembly_error_from_log.py ../test_project --error-text 'Could not load file or assembly...'")
        sys.exit(1)
    
    project_path = os.path.abspath(sys.argv[1])
    
    error_log_file = None
    error_text = None
    
    if len(sys.argv) >= 3:
        if sys.argv[2] == '--error-text' and len(sys.argv) >= 4:
            error_text = sys.argv[3]
        else:
            error_log_file = sys.argv[2]
    
    success = fix_from_error_log(project_path, error_log_file, error_text)
    
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