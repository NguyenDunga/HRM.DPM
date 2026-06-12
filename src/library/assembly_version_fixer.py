import os
import xml.etree.ElementTree as ET
import subprocess
import re
import shutil
from datetime import datetime
from common_csproj import find_csproj_file, beautify_xml
from config_loader import load_config

class AssemblyVersionFixer:
    def __init__(self, config_path='config.yaml'):
        self.binding_redirects = []
        self.config = load_config(config_path)
        self.assembly_config = self.config.get('assembly_bindings', {})
        self.settings = self.assembly_config.get('settings', {})
    
    def analyze_assembly_error(self, error_text):
        """Extract assembly information from error messages"""
        assembly_info = {}
        
        # Extract assembly name
        name_match = re.search(r"Could not load file or assembly '([^,']+)", error_text)
        if name_match:
            assembly_info['name'] = name_match.group(1)
        
        # Extract expected version
        version_match = re.search(r"Version=([^,]+)", error_text)
        if version_match:
            assembly_info['expected_version'] = version_match.group(1)
        
        # Extract redirect info
        redirect_match = re.search(r"(\d+\.\d+\.\d+\.\d+) redirected to (\d+\.\d+\.\d+\.\d+)", error_text)
        if redirect_match:
            assembly_info['old_version'] = redirect_match.group(1)
            assembly_info['new_version'] = redirect_match.group(2)
        
        # Extract public key token
        token_match = re.search(r"PublicKeyToken=([a-f0-9]+)", error_text)
        if token_match:
            assembly_info['public_key_token'] = token_match.group(1)
            
        return assembly_info

    def get_assembly_versions_from_packages(self, project_path, assembly_name):
        """Get all available versions of an assembly from installed packages"""
        versions = []
        
        # Check packages folder
        packages_path = os.path.join(project_path, "packages")
        if os.path.exists(packages_path):
            for folder in os.listdir(packages_path):
                if folder.lower().startswith(assembly_name.lower()):
                    version_match = re.search(r'\.(\d+\.\d+\.\d+(?:\.\d+)?)', folder)
                    if version_match:
                        versions.append(version_match.group(1))
        
        return versions

    def find_assembly_in_bin(self, project_path, assembly_name):
        """Find assembly DLL in bin directory and get its version"""
        bin_paths = [
            os.path.join(project_path, "bin", "Debug"),
            os.path.join(project_path, "bin", "Release"),
            os.path.join(project_path, "bin")
        ]
        
        for bin_path in bin_paths:
            if os.path.exists(bin_path):
                dll_path = os.path.join(bin_path, f"{assembly_name}.dll")
                if os.path.exists(dll_path):
                    return self.get_assembly_version(dll_path)
        return None

    def get_assembly_version(self, dll_path):
        """Get version of a DLL file using PowerShell"""
        try:
            result = subprocess.run([
                'powershell', '-Command',
                f'[System.Reflection.AssemblyName]::GetAssemblyName("{dll_path}").Version.ToString()'
            ], capture_output=True, text=True, check=True)
            return result.stdout.strip()
        except:
            return None

    def get_configured_assemblies(self):
        """Get all configured assemblies from config.yaml"""
        assemblies = []
        
        # Get common assemblies if enabled
        if self.settings.get('auto_apply_common', True):
            common = self.assembly_config.get('common_assemblies', [])
            if common:
                assemblies.extend(common)
        
        # Get custom assemblies
        custom = self.assembly_config.get('custom_assemblies', [])
        if custom:
            assemblies.extend(custom)
        
        return assemblies

    def find_assembly_config(self, assembly_name):
        """Find assembly configuration by name"""
        configured_assemblies = self.get_configured_assemblies()
        
        for assembly in configured_assemblies:
            if assembly['name'].lower() == assembly_name.lower():
                return assembly
        
        return None

    def backup_config_file(self, config_path):
        """Create backup of config file if enabled"""
        if not self.settings.get('backup_configs', True):
            return
        
        if os.path.exists(config_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{config_path}.backup_{timestamp}"
            try:
                shutil.copy2(config_path, backup_path)
                print(f"Created backup: {backup_path}")
            except Exception as e:
                print(f"Warning: Could not create backup: {e}")

    def create_or_update_app_config(self, project_path, assembly_info):
        """Create or update App.config with binding redirects"""
        config_path = os.path.join(project_path, "App.config")
        web_config_path = os.path.join(project_path, "web.config")
        
        # Determine which config file to use
        if os.path.exists(web_config_path):
            config_path = web_config_path
        elif not os.path.exists(config_path):
            if self.settings.get('create_missing_config', True):
                # Create new App.config
                self.create_basic_app_config(config_path)
            else:
                print(f"Config file not found and creation disabled: {config_path}")
                return
        
        # Create backup
        self.backup_config_file(config_path)
        
        self.add_binding_redirect(config_path, assembly_info)

    def create_basic_app_config(self, config_path):
        """Create a basic App.config file"""
        config_content = '''<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <startup>
        <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8.1" />
    </startup>
    <runtime>
        <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">
        </assemblyBinding>
    </runtime>
</configuration>'''
        
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(config_content)

    def add_binding_redirect(self, config_path, assembly_info):
        """Add binding redirect to configuration file"""
        # Parse the XML
        ET.register_namespace('', '')
        tree = ET.parse(config_path)
        root = tree.getroot()
        
        # Find or create runtime section
        runtime = root.find('runtime')
        if runtime is None:
            runtime = ET.SubElement(root, 'runtime')
        
        # Find or create assemblyBinding section
        assembly_binding = runtime.find('.//{urn:schemas-microsoft-com:asm.v1}assemblyBinding')
        if assembly_binding is None:
            assembly_binding = ET.SubElement(runtime, 'assemblyBinding')
            assembly_binding.set('xmlns', 'urn:schemas-microsoft-com:asm.v1')
        
        # Check if redirect already exists
        existing_redirect = None
        for dependent_assembly in assembly_binding.findall('.//{urn:schemas-microsoft-com:asm.v1}dependentAssembly'):
            assembly_identity = dependent_assembly.find('.//{urn:schemas-microsoft-com:asm.v1}assemblyIdentity')
            if (assembly_identity is not None and 
                assembly_identity.get('name') == assembly_info['name']):
                existing_redirect = dependent_assembly
                break
        
        if existing_redirect is not None:
            # Update existing redirect
            binding_redirect = existing_redirect.find('.//{urn:schemas-microsoft-com:asm.v1}bindingRedirect')
            if binding_redirect is not None:
                binding_redirect.set('newVersion', assembly_info.get('new_version', assembly_info.get('expected_version')))
        else:
            # Create new redirect
            dependent_assembly = ET.SubElement(assembly_binding, 'dependentAssembly')
            dependent_assembly.set('xmlns', 'urn:schemas-microsoft-com:asm.v1')
            
            assembly_identity = ET.SubElement(dependent_assembly, 'assemblyIdentity')
            assembly_identity.set('name', assembly_info['name'])
            assembly_identity.set('culture', 'neutral')
            if 'public_key_token' in assembly_info:
                assembly_identity.set('publicKeyToken', assembly_info['public_key_token'])
            
            binding_redirect = ET.SubElement(dependent_assembly, 'bindingRedirect')
            old_version_range = assembly_info.get('old_version_range')
            new_version = assembly_info.get('new_version', assembly_info.get('expected_version'))
            
            if old_version_range:
                binding_redirect.set('oldVersion', old_version_range)
            else:
                old_version = assembly_info.get('old_version', '0.0.0.0')
                binding_redirect.set('oldVersion', f'0.0.0.0-{new_version}')
                
            binding_redirect.set('newVersion', new_version)
        
        # Write back to file
        tree.write(config_path, xml_declaration=True, encoding='utf-8')
        
        # Beautify the XML
        self.beautify_config_xml(config_path)
        
        print(f"Added binding redirect for {assembly_info['name']} to {config_path}")

    def beautify_config_xml(self, file_path):
        """Beautify XML configuration file"""
        try:
            import xml.dom.minidom
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            dom = xml.dom.minidom.parseString(content)
            pretty_content = dom.toprettyxml(indent='    ', encoding='utf-8').decode('utf-8')
            
            # Remove extra empty lines
            lines = [line for line in pretty_content.split('\n') if line.strip()]
            pretty_content = '\n'.join(lines)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(pretty_content)
        except:
            pass  # If beautification fails, keep original content

    def fix_assembly_version_mismatch(self, project_path, error_text=None, assembly_name=None, expected_version=None):
        """Main method to fix assembly version mismatch"""
        if error_text:
            assembly_info = self.analyze_assembly_error(error_text)
        else:
            assembly_info = {
                'name': assembly_name,
                'expected_version': expected_version
            }
        
        if not assembly_info.get('name'):
            print("Could not determine assembly name from error")
            return False
        
        print(f"Fixing assembly version mismatch for: {assembly_info['name']}")
        
        # Check if assembly is configured in config.yaml
        config_assembly = self.find_assembly_config(assembly_info['name'])
        if config_assembly:
            print(f"Found configuration for {assembly_info['name']}")
            # Use configured values
            assembly_info.update({
                'new_version': config_assembly['version'],
                'public_key_token': config_assembly.get('public_key_token'),
                'old_version_range': config_assembly.get('old_version_range', f"0.0.0.0-{config_assembly['version']}")
            })
        else:
            print(f"No configuration found for {assembly_info['name']}, using auto-detection")
            
            # Try to find actual version in bin directory
            actual_version = self.find_assembly_in_bin(project_path, assembly_info['name'])
            if actual_version:
                assembly_info['new_version'] = actual_version
                print(f"Found actual version in bin: {actual_version}")
            
            # Get available versions from packages
            available_versions = self.get_assembly_versions_from_packages(project_path, assembly_info['name'])
            if available_versions:
                # Use the highest available version
                assembly_info['new_version'] = max(available_versions, key=lambda x: tuple(map(int, x.split('.'))))
                print(f"Available versions: {available_versions}")
                print(f"Using version: {assembly_info['new_version']}")
        
        # Create or update configuration
        self.create_or_update_app_config(project_path, assembly_info)
        
        return True

    def apply_all_configured_bindings(self, project_path):
        """Apply all configured assembly bindings to a project"""
        print(f"Applying configured assembly bindings to: {project_path}")
        
        configured_assemblies = self.get_configured_assemblies()
        
        if not configured_assemblies:
            print("No assembly bindings configured")
            return True
        
        success_count = 0
        for assembly_config in configured_assemblies:
            assembly_info = {
                'name': assembly_config['name'],
                'new_version': assembly_config['version'],
                'public_key_token': assembly_config.get('public_key_token'),
                'old_version_range': assembly_config.get('old_version_range', f"0.0.0.0-{assembly_config['version']}")
            }
            
            print(f"Applying binding for: {assembly_info['name']} -> {assembly_info['new_version']}")
            
            try:
                self.create_or_update_app_config(project_path, assembly_info)
                success_count += 1
            except Exception as e:
                print(f"Failed to apply binding for {assembly_info['name']}: {e}")
        
        print(f"Successfully applied {success_count}/{len(configured_assemblies)} assembly bindings")
        return success_count == len(configured_assemblies)

def fix_microsoft_bcl_asyncinterfaces_error(project_path):
    """Specific fix for Microsoft.Bcl.AsyncInterfaces version mismatch"""
    fixer = AssemblyVersionFixer()
    
    # Common Microsoft.Bcl.AsyncInterfaces info
    assembly_info = {
        'name': 'Microsoft.Bcl.AsyncInterfaces',
        'public_key_token': 'cc7b13ffcd2ddd51',
        'expected_version': '9.0.0.7',  # Version from the error
        'new_version': '9.0.0.7'
    }
    
    print("Fixing Microsoft.Bcl.AsyncInterfaces version mismatch...")
    fixer.create_or_update_app_config(project_path, assembly_info)
    
    return True

# Example usage function
def fix_assembly_error_from_log(project_path, error_log_text):
    """Fix assembly error from error log text"""
    fixer = AssemblyVersionFixer()
    return fixer.fix_assembly_version_mismatch(project_path, error_text=error_log_text)

if __name__ == "__main__":
    # Example usage
    project_path = "../test_project"
    error_text = """Could not load file or assembly 'Microsoft.Bcl.AsyncInterfaces, Version=9.0.0.7, Culture=neutral, PublicKeyToken=cc7b13ffcd2ddd51' or one of its dependencies. The located assembly's manifest definition does not match the assembly reference. (Exception from HRESULT: 0x80131040)"""
    
    fix_assembly_error_from_log(project_path, error_text)