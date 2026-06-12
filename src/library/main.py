import os
from install_nuget_packages import install_nuget_packages
from fix_project_missing_add_dll import fix_project_missing_add_dll
from assembly_version_fixer import AssemblyVersionFixer, fix_microsoft_bcl_asyncinterfaces_error
from config_loader import load_config

def main():
    config = load_config('config.yaml')
    # Run solution deprecated
    

    # Run the install_nuget_packages function
    install_nuget_packages(config)
    
    # Run the fix_project_missing_add_dll logic
    # fix_project_missing_add_dll(config)
    
    # Fix common assembly version mismatches
    fix_assembly_version_issues(config)

def fix_assembly_version_issues(config):
    """Fix assembly version mismatch issues using config-driven approach"""
    print("Applying assembly version fixes from configuration...")
    
    # Get project paths from config
    project_paths = []
    if 'add' in config and 'packages' in config['add']:
        project_paths.extend([project['path'] for project in config['add']['packages']])
    if 'edit' in config and 'project' in config['edit'] and 'path' in config['edit']['project']:
        project_paths.extend(config['edit']['project']['path'])
    
    # Remove duplicates
    project_paths = list(set(project_paths))
    
    # Create fixer with config
    fixer = AssemblyVersionFixer('config.yaml')
    
    # Check if assembly binding is enabled
    assembly_config = config.get('assembly_bindings', {})
    if not assembly_config:
        print("No assembly bindings configuration found in config.yaml")
        return
    
    settings = assembly_config.get('settings', {})
    
    for project_path in project_paths:
        if os.path.exists(project_path):
            print(f"Processing project: {project_path}")
            
            # Apply all configured bindings if auto-detection is enabled
            if settings.get('auto_detect_mismatches', True):
                fixer.apply_all_configured_bindings(project_path)
            else:
                print(f"Auto-detection disabled for project: {project_path}")
        else:
            print(f"Project path does not exist: {project_path}")

if __name__ == "__main__":
    main()