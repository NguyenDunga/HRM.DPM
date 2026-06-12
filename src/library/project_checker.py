import os
from csproj_handler import modify_csproj
import xml.etree.ElementTree as ET

def get_project_project_reference(csproj_path, project_path):
    tree = ET.parse(csproj_path)
    root = tree.getroot()
    namespace = {'msbuild': 'http://schemas.microsoft.com/developer/msbuild/2003'}
    project_info = []
    for reference in root.findall('msbuild:ItemGroup/msbuild:ProjectReference', namespace):
        include_path = reference.get('Include')
        name_element = reference.find('msbuild:Name', namespace)
        if name_element is not None:
            project_name = name_element.text
            absolute_path = os.path.abspath(os.path.join(project_path, include_path))
            if os.path.exists(absolute_path) == False:
                project_info.append({'name': project_name, 'path': absolute_path})
    return project_info

def check_and_import_projects(project_info, library_paths, project_path, csproj_path, conversation):
    for project in project_info:
        project_name = project['name']
        project_csproj_path = project['path']
        
        if not os.path.exists(project_csproj_path):
            print(f"{project_name}.csproj is missing in the project. Attempting to modify .csproj to reference DLL from library.")
            dll_found = False
            for library_path in library_paths:
                # Check if there is a conversation for the project name
                library_name = conversation.get(project_name, project_name)
                if library_name == project_name:
                    library_name += ".dll"
                library_dll_path = os.path.abspath(os.path.join(library_path, library_name))
                if os.path.exists(library_dll_path):
                    modify_csproj(csproj_path, project_name, library_dll_path)
                    print(f"Successfully modified .csproj to reference {library_name}.dll from library at {library_path}.")
                    dll_found = True
                    break
            if not dll_found:
                print(f"Failed to modify .csproj. {project_name}.dll does not exist in any of the specified library paths.")
        else:
            print(f"{project_name}.csproj already exists in the project.")
