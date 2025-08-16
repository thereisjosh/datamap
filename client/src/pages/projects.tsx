import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { api, type ProjectResponse } from '@/lib/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { OrganizationInfo } from '@/components/organizations/OrganizationSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Search, 
  FolderOpen, 
  Calendar, 
  Users, 
  Eye, 
  MoreVertical,
  Edit,
  Trash2,
  Download,
  Share,
  Copy,
  Settings
} from 'lucide-react';
import { useLocation } from 'wouter';

interface ProjectsProps {
  isDarkMode?: boolean;
  setIsDarkMode?: (isDark: boolean) => void;
}

// Use ProjectResponse from API, but extend it for UI display
interface Project extends ProjectResponse {
  owner?: {
    id: string;
    name: string;
    email: string;
  };
  tables_count?: number;
  relationships_count?: number;
  preview_image?: string;
}

const Projects = ({ isDarkMode = false, setIsDarkMode }: ProjectsProps) => {
  const [, navigate] = useLocation();
  const { user, activeOrganization } = useAuth();
  const { toast } = useToast();

  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Project management state
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameProjectName, setRenameProjectName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  // Load projects on component mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const response = await api.getProjects();
      
      // Transform API response to match UI interface
      const transformedProjects: Project[] = response.projects.map(project => ({
        ...project,
        owner: {
          id: project.ownerId,
          name: user?.name || 'Unknown User',
          email: user?.email || 'unknown@example.com'
        },
        // Use the actual counts from the API (now included in response)
        tables_count: project.tables_count || 0,
        relationships_count: project.relationships_count || 0,
      }));
      
      setProjects(transformedProjects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast({
        title: "Failed to load projects",
        description: "Please try refreshing the page.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.owner?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast({
        title: "Project name required",
        description: "Please enter a project name.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    
    try {
      const response = await api.createProject({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
        settings: {}
      });
      
      toast({
        title: "Project Created",
        description: `Project "${newProjectName}" has been created successfully.`,
      });
      
      setIsCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
      
      // Refresh projects list
      await loadProjects();
      
      // Navigate to the new project upload flow
      navigate(`/projects/${response.project.id}/upload`);
    } catch (error) {
      console.error('Project creation error:', error);
      toast({
        title: "Creation Failed",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewProject = (projectId: string) => {
    navigate(`/projects/${projectId}/erd`);
  };

  const handleEditProject = (projectId: string) => {
    navigate(`/projects/${projectId}/upload`);
  };

  const handleRenameProject = (projectId: string, currentName: string) => {
    setRenameProjectId(projectId);
    setRenameProjectName(currentName);
    setIsRenameDialogOpen(true);
  };

  const submitRenameProject = async () => {
    if (!renameProjectId || !renameProjectName.trim()) {
      toast({
        title: "Project name required",
        description: "Please enter a valid project name.",
        variant: "destructive",
      });
      return;
    }

    setIsRenaming(true);
    try {
      await api.updateProject(renameProjectId, {
        name: renameProjectName.trim()
      });

      toast({
        title: "Project Renamed",
        description: `Project renamed to "${renameProjectName.trim()}".`,
      });

      setIsRenameDialogOpen(false);
      setRenameProjectId(null);
      setRenameProjectName('');
      
      // Refresh projects list
      await loadProjects();
    } catch (error) {
      console.error('Project rename error:', error);
      toast({
        title: "Rename Failed",
        description: "Failed to rename project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDuplicateProject = async (projectId: string, projectName: string) => {
    setIsDuplicating(projectId);
    try {
      const response = await api.duplicateProject(projectId);
      
      toast({
        title: "Project Duplicated",
        description: `Created copy: "${response.project.name}".`,
      });
      
      // Refresh projects list
      await loadProjects();
    } catch (error) {
      console.error('Project duplication error:', error);
      toast({
        title: "Duplication Failed",
        description: "Failed to duplicate project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDuplicating(null);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    try {
      await api.deleteProject(projectId);
      
      toast({
        title: "Project Deleted",
        description: `"${projectName}" has been deleted.`,
      });
      
      // Refresh projects list
      await loadProjects();
    } catch (error) {
      console.error('Project deletion error:', error);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete project. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric'
    });
  };

  const getOwnerInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      <AppHeader isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Organization Info */}
        <div className="mb-8">
          <OrganizationInfo showMemberCount={true} />
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">
              Create and manage your ERD projects with your team
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Create a new ERD project to organize your database schemas and collaborate with your team.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Enter project name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">Description (Optional)</Label>
                  <Textarea
                    id="project-description"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Describe your project"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateProject} disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Project'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-4">
                  <div className="h-6 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-4 bg-muted rounded w-1/3"></div>
                    <div className="h-8 bg-muted rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {project.description || 'No description provided'}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRenameProject(project.id, project.name)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDuplicateProject(project.id, project.name)}
                          disabled={isDuplicating === project.id}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {isDuplicating === project.id ? 'Duplicating...' : 'Duplicate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}/preview`)}>
                          <Share className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem 
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the project
                                "{project.name}" and all associated data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteProject(project.id, project.name)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Project
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Project Stats */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {project.tables_count || 0} tables
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {project.relationships_count || 0} relations
                    </div>
                  </div>

                  {/* Owner */}
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {getOwnerInitials(project.owner?.name || 'Unknown')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">
                      {project.owner?.name || 'Unknown User'}
                    </span>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created {formatDate(project.createdAt)}
                    </div>
                    <div>
                      Updated {formatDate(project.updatedAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      onClick={() => handleViewProject(project.id)}
                      className="flex-1"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View ERD
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEditProject(project.id)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  {searchQuery 
                    ? `No projects match "${searchQuery}". Try a different search term.`
                    : 'Get started by creating your first ERD project. Upload your data dictionary and generate professional diagrams.'
                  }
                </p>
                {!searchQuery && (
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Create Your First Project
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                        <DialogDescription>
                          Create a new ERD project to organize your database schemas and collaborate with your team.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="project-name">Project Name</Label>
                          <Input
                            id="project-name"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Enter project name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="project-description">Description (Optional)</Label>
                          <Textarea
                            id="project-description"
                            value={newProjectDescription}
                            onChange={(e) => setNewProjectDescription(e.target.value)}
                            placeholder="Describe your project"
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreateProject} disabled={isCreating}>
                          {isCreating ? 'Creating...' : 'Create Project'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        {filteredProjects.length > 0 && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold">{projects.length}</div>
                  <div className="text-sm text-muted-foreground">Total Projects</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {projects.reduce((sum, p) => sum + (p.tables_count || 0), 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Tables</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {projects.reduce((sum, p) => sum + (p.relationships_count || 0), 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Relationships</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Rename Project Dialog */}
        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
              <DialogDescription>
                Enter a new name for your project.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rename-project-name">Project Name</Label>
                <Input
                  id="rename-project-name"
                  value={renameProjectName}
                  onChange={(e) => setRenameProjectName(e.target.value)}
                  placeholder="Enter project name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitRenameProject} disabled={isRenaming}>
                {isRenaming ? 'Renaming...' : 'Rename Project'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Projects;