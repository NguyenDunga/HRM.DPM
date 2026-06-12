import os
import xml.etree.ElementTree as ET
from common_csproj import beautify_xml


def modify_csproj(csproj_path, project_name, library_dll_path):
    ET.register_namespace('', 'http://schemas.microsoft.com/developer/msbuild/2003')
    tree = ET.parse(csproj_path)
    root = tree.getroot()
    namespace = 'http://schemas.microsoft.com/developer/msbuild/2003'

    # Save the original XML declaration and root tag
    with open(csproj_path, 'r', encoding='utf-8') as file:
        original_content = file.read()
    original_declaration = original_content.split('\n', 1)[0]
    original_root_tag = original_content.split('\n', 2)[1]

    # Remove the ProjectReference
    for item_group in root.findall(f'{{{namespace}}}ItemGroup'):
        for project_reference in item_group.findall(f'{{{namespace}}}ProjectReference'):
            name_element = project_reference.find(f'{{{namespace}}}Name')
            if name_element is not None and name_element.text == project_name:
                item_group.remove(project_reference)
                break

    # Find or create the ItemGroup for references
    reference_group = None
    for item_group in root.findall(f'{{{namespace}}}ItemGroup'):
        if item_group.find(f'{{{namespace}}}Reference') is not None:
            reference_group = item_group
            break

    if reference_group is None:
        reference_group = ET.Element(f'{{{namespace}}}ItemGroup')
        root.append(reference_group)

    # Add the DLL reference
    reference = ET.SubElement(reference_group, f'{{{namespace}}}Reference', Include=project_name)
    hint_path = ET.SubElement(reference, f'{{{namespace}}}HintPath')
    hint_path.text = library_dll_path

    # Write the modified tree back to the file
    tree.write(csproj_path, xml_declaration=True, encoding='utf-8', method="xml")

    # Ensure the new XML content is properly formatted
    with open(csproj_path, 'r', encoding='utf-8') as file:
        modified_content = file.read()
    modified_content = modified_content.replace('<?xml version="1.0" encoding="utf-8"?>', original_declaration)
    modified_content = modified_content.replace('<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">', original_root_tag)
    with open(csproj_path, 'w', encoding='utf-8') as file:
        file.write(modified_content)

    # Beautify the XML file
    beautify_xml(csproj_path)
