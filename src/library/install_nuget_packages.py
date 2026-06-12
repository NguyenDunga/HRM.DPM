import subprocess
from common_csproj import find_csproj_file, is_dotnet_framework_project
from config_loader import load_config
import os
import urllib.request

def download_nuget_executable(destination):
    nuget_url = "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe"
    if not os.path.exists(destination):
        print(f"Downloading nuget.exe to {destination}")
        urllib.request.urlretrieve(nuget_url, destination)
    else:
        print(f"nuget.exe already exists at {destination}")

def install_nuget_packages_framework(project_path, csproj_path, reference_name, reference_version):
    """Install NuGet packages for .NET Framework projects using dotnet CLI with PackageReference"""
    try:
        original_dir = os.getcwd()
        os.chdir(project_path)
        
        # First, try to add package using dotnet add package
        result = subprocess.run([
            'dotnet', 'add', 'package', reference_name, '--version', reference_version
        ], check=True, capture_output=True, text=True)
        
        print(f"Successfully installed {reference_name} {reference_version}")
        print(result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"Failed to install package {reference_name} version {reference_version} using dotnet CLI")
        print(f"Error: {e.stderr}")
        print("Attempting manual PackageReference addition...")
        
        # Fallback: manually add PackageReference to csproj
        add_package_reference_to_csproj(csproj_path, reference_name, reference_version)
        
    finally:
        os.chdir(original_dir)

def install_nuget_packages_core(project_path, csproj_path, reference_name, reference_version):
    """Install NuGet packages for .NET Core/.NET 5+ projects using dotnet CLI"""
    try:
        original_dir = os.getcwd()
        os.chdir(project_path)

        result = subprocess.run([
            'dotnet', 'add', csproj_path, 'package', reference_name, '--version', reference_version
        ], check=True, capture_output=True, text=True)
        
        print(f"Successfully installed {reference_name} {reference_version}")
        print(result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"Failed to install package {reference_name} version {reference_version}")
        print(f"Error: {e.stderr}")
    finally:
        os.chdir(original_dir)

def create_packages_config(packages_config_path):
    """Create a basic packages.config file for .NET Framework projects"""
    config_content = '''<?xml version="1.0" encoding="utf-8"?>
<packages>
</packages>'''
    with open(packages_config_path, 'w', encoding='utf-8') as f:
        f.write(config_content)

def add_package_reference_to_csproj(csproj_path, reference_name, reference_version):
    """Add PackageReference to .csproj file manually"""
    import xml.etree.ElementTree as ET
    from common_csproj import beautify_xml
    
    # Register namespace to preserve formatting
    ET.register_namespace('', 'http://schemas.microsoft.com/developer/msbuild/2003')
    
    tree = ET.parse(csproj_path)
    root = tree.getroot()
    namespace = 'http://schemas.microsoft.com/developer/msbuild/2003'
    
    # Check if PackageReference already exists
    for item_group in root.findall(f'{{{namespace}}}ItemGroup'):
        for package_ref in item_group.findall(f'{{{namespace}}}PackageReference'):
            if package_ref.get('Include') == reference_name:
                print(f"PackageReference for {reference_name} already exists")
                return
    
    # Find or create ItemGroup for PackageReferences
    package_group = None
    for item_group in root.findall(f'{{{namespace}}}ItemGroup'):
        if item_group.find(f'{{{namespace}}}PackageReference') is not None:
            package_group = item_group
            break
    
    if package_group is None:
        package_group = ET.Element(f'{{{namespace}}}ItemGroup')
        root.append(package_group)
    
    # Add PackageReference
    package_ref = ET.SubElement(package_group, f'{{{namespace}}}PackageReference', Include=reference_name)
    version_elem = ET.SubElement(package_ref, f'{{{namespace}}}Version')
    version_elem.text = reference_version
    
    # Write back to file
    tree.write(csproj_path, xml_declaration=True, encoding='utf-8', method="xml")
    beautify_xml(csproj_path)
    print(f"Manually added PackageReference for {reference_name} {reference_version}")

def install_nuget_packages(config):
    add_projects = config['add']['packages']

    for project in add_projects:
        project_path = project['path']
        reference_name = project['reference']['name']
        reference_version = project['reference']['version']
        csproj_path = find_csproj_file(project_path)
        
        print(f"Installing {reference_name} {reference_version} for project: {project_path}")
        
        # Detect project type and use appropriate installation method
        if is_dotnet_framework_project(csproj_path):
            print(f"Detected .NET Framework project")
            install_nuget_packages_framework(project_path, csproj_path, reference_name, reference_version)
        else:
            print(f"Detected .NET Core/.NET 5+ project")
            install_nuget_packages_core(project_path, csproj_path, reference_name, reference_version)

