import os
import xml.etree.ElementTree as ET

def find_csproj_file(project_path):
    for file in os.listdir(project_path):
        if file.endswith('.csproj'):
            return os.path.join(project_path, file)
    raise FileNotFoundError("No .csproj file found in the project directory.")

def beautify_xml(csproj_path):
    import xml.dom.minidom
    dom = xml.dom.minidom.parse(csproj_path)
    pretty_xml_as_string = dom.toprettyxml(indent="  ")
    
    # Remove extra newlines and preserve single spaces
    lines = pretty_xml_as_string.splitlines()
    non_empty_lines = [line for line in lines if line.strip()]
    pretty_xml_as_string = '\n'.join(non_empty_lines)
    
    # Remove unnecessary spaces before self-closing tags
    pretty_xml_as_string = pretty_xml_as_string.replace('/>', ' />')

    with open(csproj_path, 'w', encoding='utf-8') as file:
        file.write(pretty_xml_as_string)

def is_dotnet_framework_project(csproj_path):
    tree = ET.parse(csproj_path)
    root = tree.getroot()
    
    # Check for ToolsVersion attribute (present in .NET Framework projects)
    if root.get('ToolsVersion'):
        return True
    
    # Check for TargetFrameworkVersion (present in .NET Framework projects)
    for prop_group in root.findall('.//PropertyGroup'):
        target_fw = prop_group.find('TargetFrameworkVersion')
        if target_fw is not None:
            return True
        
        # Check for TargetFramework starting with 'net' but not 'netcoreapp' or 'net5.0+'
        target_fw = prop_group.find('TargetFramework')
        if target_fw is not None:
            fw_value = target_fw.text.lower()
            if fw_value.startswith('net') and not fw_value.startswith('netcoreapp') and not fw_value.startswith('netstandard'):
                # Check if it's a .NET Framework version (like net48, net481)
                if fw_value.startswith('net4') or fw_value in ['net35', 'net20', 'net11', 'net10']:
                    return True
    
    return False