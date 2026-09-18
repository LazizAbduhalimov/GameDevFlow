using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
static class ConseptUnityBridge
{
    const string CommandPath = "Temp/Consept/command.json";
    const string LastIdPath = "Temp/Consept/last-id.txt";
    static double nextPoll;

    static ConseptUnityBridge()
    {
        EditorApplication.delayCall += ProcessPending;
        EditorApplication.update += Tick;
    }

    static void Tick()
    {
        if (EditorApplication.timeSinceStartup < nextPoll) return;
        nextPoll = EditorApplication.timeSinceStartup + 0.6;
        ProcessPending();
    }

    [Serializable]
    class Command
    {
        public string id;
        public bool placeOnScene;
        public CommandAsset[] assets;
    }

    [Serializable]
    class CommandAsset
    {
        public string unityPath;
        public string kind;
        public string name;
    }

    internal static void ProcessPending()
    {
        if (!File.Exists(CommandPath)) return;
        Command command;
        try { command = JsonUtility.FromJson<Command>(File.ReadAllText(CommandPath)); }
        catch (Exception error)
        {
            Debug.LogWarning("Consept Unity bridge could not read Temp/Consept/command.json: " + error.Message);
            return;
        }
        if (command == null || string.IsNullOrEmpty(command.id)) return;
        if (File.Exists(LastIdPath) && File.ReadAllText(LastIdPath).Trim() == command.id) return;

        AssetDatabase.Refresh();
        var assets = command.assets ?? Array.Empty<CommandAsset>();
        var pending = false;
        foreach (var asset in assets)
        {
            if (asset == null || string.IsNullOrEmpty(asset.unityPath)) continue;
            if (asset.kind == "model" && command.placeOnScene)
            {
                if (!TryPlaceModel(asset)) pending = true;
            }
        }

        if (pending) return;
        Directory.CreateDirectory(Path.GetDirectoryName(LastIdPath) ?? "Temp/Consept");
        File.WriteAllText(LastIdPath, command.id);
    }

    static bool TryPlaceModel(CommandAsset asset)
    {
        var model = LoadModel(asset.unityPath);
        if (!model)
        {
            var mainType = AssetDatabase.GetMainAssetTypeAtPath(asset.unityPath);
            if (mainType == null || mainType == typeof(DefaultAsset)) return false;
            Debug.LogWarning("Consept copied a GLB to " + asset.unityPath + ", but Unity has no glTF importer yet. Install glTFast if the model does not appear.");
            return true;
        }

        var instance = PrefabUtility.InstantiatePrefab(model) as GameObject;
        if (!instance) instance = UnityEngine.Object.Instantiate(model);
        instance.name = string.IsNullOrEmpty(asset.name) ? model.name : asset.name;
        instance.transform.position = NextImportPosition();
        Undo.RegisterCreatedObjectUndo(instance, "Consept Unity import");
        Selection.activeGameObject = instance;
        if (SceneView.lastActiveSceneView) SceneView.lastActiveSceneView.FrameSelected();
        EditorSceneManager.MarkSceneDirty(instance.scene);
        return true;
    }

    static GameObject LoadModel(string unityPath)
    {
        var direct = AssetDatabase.LoadAssetAtPath<GameObject>(unityPath);
        if (direct) return direct;
        return AssetDatabase.LoadAllAssetsAtPath(unityPath).OfType<GameObject>().FirstOrDefault();
    }

    static Vector3 NextImportPosition()
    {
        var existing = UnityEngine.Object.FindObjectsOfType<Transform>()
            .Count(item => item && item.name.StartsWith("Consept ", StringComparison.Ordinal));
        return new Vector3(existing * 2f, 0f, 0f);
    }
}

class ConseptUnityAssetHook : AssetPostprocessor
{
    static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
    {
        ConseptUnityBridge.ProcessPending();
    }
}
