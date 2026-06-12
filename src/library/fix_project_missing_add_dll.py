from common_csproj import find_csproj_file
from project_checker import check_and_import_projects, get_project_project_reference


def fix_project_missing_add_dll(config):
    library_paths = config['edit']['library']['paths']
    project_paths = config['edit']['project']['path']
    conversation = config['edit'].get('conversation', {})
    
    # Iterate over each project path
    for project_path in project_paths:
        # Find the .csproj file dynamically
        csproj_path = find_csproj_file(project_path)

        # Get project info from .csproj file
        project_info_to_check = get_project_project_reference(csproj_path, project_path)

        # Run the check and import process
        check_and_import_projects(project_info_to_check, library_paths, project_path, csproj_path, conversation)
