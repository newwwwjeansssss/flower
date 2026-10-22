using System;
using FlowerFit.Application;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
namespace FlowerFit.Presentation
{
    // Per-attempt debug charges. No wallet, store, ads or player-save mutations.
    public sealed class FlowerFreezeTimeView : MonoBehaviour
    {
        LevelSession session;
        Button button,originalTrash;
        TMP_Text count,status;
        Func<bool> available;
        public static FlowerFreezeTimeView Create(Button trash,TMP_FontAsset font)
        {
            var go=new GameObject("FreezeTimeButton",typeof(RectTransform),typeof(Image),typeof(Button),typeof(FlowerFreezeTimeView));
            var rt=go.GetComponent<RectTransform>();var source=(RectTransform)trash.transform;
            rt.SetParent(source.parent,false);rt.anchorMin=source.anchorMin;rt.anchorMax=source.anchorMax;rt.pivot=source.pivot;
            rt.sizeDelta=source.sizeDelta;rt.anchoredPosition=source.anchoredPosition;rt.localScale=source.localScale;
            var image=go.GetComponent<Image>();image.sprite=Resources.Load<Sprite>("FlowerFitObstacleArt/FreezeTime");image.preserveAspect=true;
            var v=go.GetComponent<FlowerFreezeTimeView>();v.originalTrash=trash;v.button=go.GetComponent<Button>();v.button.targetGraphic=image;
            TMP_Text Label(string name,Vector2 position,float size)
            {
                var t=new GameObject(name,typeof(RectTransform),typeof(TextMeshProUGUI)).GetComponent<TextMeshProUGUI>();t.transform.SetParent(rt,false);
                t.rectTransform.sizeDelta=new Vector2(360,62);t.rectTransform.anchoredPosition=position;
                t.font=font;t.fontSize=size;t.alignment=TextAlignmentOptions.Center;t.color=new Color(.2f,.32f,.4f);t.raycastTarget=false;return t;
            }
            v.count=Label("Charges",new Vector2(0,-source.rect.height*.6f),42);
            v.status=Label("FreezeClock",new Vector2(0,source.rect.height*.8f),38);
            v.button.onClick.AddListener(v.Use);return v;
        }
        public void Bind(LevelSession value,Func<bool> canUse)
        {
            session=value;available=canUse;
            bool enabled=value.GetSnapshot().Level.ObstacleRules!=null;
            originalTrash.gameObject.SetActive(!enabled);gameObject.SetActive(enabled);Refresh();
        }
        void Use()
        {
            if(session==null || available?.Invoke()==false)return;
            session.Attempt.TryFreezeTime();Refresh();
        }
        void LateUpdate()=>Refresh();
        void Refresh()
        {
            if(session==null)return;
            var attempt=session.Attempt;
            button.interactable=attempt.CanEdit&&attempt.FreezeCharges>0&&available?.Invoke()!=false;
            count.text="×"+attempt.FreezeCharges;
            int seconds=(int)Math.Ceiling(attempt.Remaining);
            status.text=$"{seconds/60:00}:{seconds%60:00}"+(attempt.FreezeRemaining>0?$"  [{Math.Ceiling(attempt.FreezeRemaining)}s]":"");
            status.color=attempt.FreezeRemaining>0?new Color(0,.55f,.8f):new Color(.2f,.32f,.4f);
        }
    }
}
