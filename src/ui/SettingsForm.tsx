// src/ui/SettingsForm.tsx
import React from 'react';
import { useSettingsManager } from '@/hooks/use-settings-manager';
import { Input, FormField, FormItem, FormLabel, FormControl } from './Form';
import Button from './Button';
import SonarrForm from './SonarrForm';
import { CheckCircledIcon, CrossCircledIcon, ReloadIcon } from '@radix-ui/react-icons';

const SettingsForm: React.FC = () => {
  const manager = useSettingsManager();
  if (manager.isLoading) {
    return <div className="text-center p-8 text-text-secondary">Loading settings...</div>;
  }

  const getConnectButtonText = () => {
    if (manager.testConnectionState.isError) return 'Retry';
    return 'Connect';
  };

  const handleConnectSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent page reload
    
    // Do not attempt to connect if already connected or in the middle of a request.
    if (manager.isConnected || manager.testConnectionState.isPending) {
      return;
    }
    
    manager.handleTestConnection();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleConnectSubmit} className="space-y-4 p-4 border border-border-primary rounded-lg">
        <h2 className="text-lg font-semibold border-b border-border-primary pb-2">Sonarr Connection</h2>
        <FormField>
          <FormItem>
            <FormLabel>Sonarr URL</FormLabel>
            <FormControl>
              <Input
                value={manager.formState.sonarrUrl}
                onChange={(e) => manager.handleFieldChange('sonarrUrl', e.target.value)}
                placeholder="http://localhost:8989"
                disabled={manager.isConnected}
              />
            </FormControl>
          </FormItem>
        </FormField>
        <FormField>
          <FormItem>
            <FormLabel>Sonarr API Key</FormLabel>
            <FormControl>
              <Input
                type="password"
                value={manager.formState.sonarrApiKey}
                onChange={(e) => manager.handleFieldChange('sonarrApiKey', e.target.value)}
                placeholder="Sonarr API key"
                disabled={manager.isConnected}
              />
            </FormControl>
          </FormItem>
        </FormField>
        
        <FormField>
          <FormItem>
            {/* Column 1: Status Text */}
            <div className="text-sm flex items-center gap-1 h-9">
              {manager.testConnectionState.isSuccess && <><CheckCircledIcon className="text-success"/><span>Connected</span></>}
              {manager.testConnectionState.isError && <><CrossCircledIcon className="text-error"/><span>Failed</span></>}
            </div>

            {/* Column 2: Button */}
            <FormControl>
              {manager.testConnectionState.isSuccess ? (
                <div className="flex justify-end">
                  <Button onClick={manager.resetConnection} variant="secondary" size="sm" type="button" className="w-full"
>
                    Edit
                  </Button>
                </div>
              ) : (
                <Button 
                  type="submit"
                  isLoading={manager.testConnectionState.isPending} 
                  variant="secondary"
                  loadingText="Connecting..."
                  className="w-full"
                >
                  {getConnectButtonText()}
                </Button>
              )}
            </FormControl>
          </FormItem>
        </FormField>
      </form>

      {/* --- Default Options Section --- */}
      {manager.isConnected && (
        <div className="space-y-4 p-4 border border-border-primary rounded-lg">
            <div className="flex justify-between items-center border-b border-border-primary pb-2">
                <h2 className="text-lg font-semibold">Default Options</h2>
                <Button onClick={manager.handleRefresh} isLoading={manager.sonarrMetadata.isRefetching} variant="ghost" size="icon" tooltip="Refresh data from Sonarr">
                    <ReloadIcon/>
                </Button>
            </div>
          
            {manager.sonarrMetadata.isFetching ? (
              <div className="text-center p-8 text-text-secondary">
                Loading Sonarr data...
              </div>
            ) : manager.sonarrMetadata.data ? (
              <div className="space-y-6">
                <SonarrForm
                  options={manager.formState.defaults}
                  data={manager.sonarrMetadata.data}
                  onChange={manager.handleDefaultsChange}
                  disabled={manager.saveState.isPending}
                />
              </div>
            ) : null}
        </div>
      )}

      {/* --- Save Button --- */}
      <div className="flex justify-center">
        <Button 
          onClick={manager.handleSave} 
          disabled={!manager.isDirty || manager.saveState.isPending || manager.testConnectionState.isPending} 
          isLoading={manager.saveState.isPending}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
};

export default React.memo(SettingsForm);